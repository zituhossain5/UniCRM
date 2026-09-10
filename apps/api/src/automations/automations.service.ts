import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import {
  AutomationEntityType,
  type AutomationRun,
  AutomationRunStatus,
  AutomationTriggerType,
  Prisma,
  ProjectStatus,
  QuotationStatus,
  TaskStatus,
  LeadPriority,
  WorkPriority,
} from '../generated/prisma/client';
import { IntegrationsService } from '../integrations/integrations.service';
import { JobsService } from '../jobs/jobs.service';
import { CrmEmailService } from '../email/crm-email.service';
import {
  AUTOMATION_EVENT_MAP,
  AUTOMATION_MAX_ATTEMPTS,
  AUTOMATION_MAX_DEPTH,
  type AutomationEventType,
} from './automation.constants';
import type {
  AutomationActionDto,
  AutomationConditionDto,
  AutomationTriggerConfigDto,
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto,
} from './dto/automations.dto';

type Snapshot = Record<string, unknown> & { id: string };
type AutomationGraphNode = {
  id: string;
  type: 'trigger' | 'condition' | 'action';
  position?: { x?: number; y?: number };
  data?: Record<string, unknown>;
};
type AutomationGraphEdge = {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};
type AutomationGraphMetadata = {
  version?: number;
  nodes?: AutomationGraphNode[];
  edges?: AutomationGraphEdge[];
  viewport?: Record<string, unknown>;
};
type CompiledAutomationDefinition = CreateAutomationRuleDto & {
  graphMetadata: AutomationGraphMetadata;
};
type ActionResult = {
  index: number;
  type: string;
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  summary: string;
  completedAt: string;
};
type RunWithRule = AutomationRun & {
  automationRule: {
    id: string;
    name: string;
    createdById: string;
    active: boolean;
    triggerType: AutomationTriggerType;
    triggerConfig: Prisma.JsonValue | null;
    conditions: Prisma.JsonValue;
    actions: Prisma.JsonValue;
    graphMetadata: Prisma.JsonValue | null;
  };
};

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(IntegrationsService) private readonly integrations: IntegrationsService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CrmEmailService) private readonly crmEmail: CrmEmailService,
  ) {}

  listRules(principal: AuthenticatedPrincipal) {
    return this.prisma.automationRule.findMany({
      where: { organizationId: principal.organizationId },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async referenceData(principal: AuthenticatedPrincipal, entityType: AutomationEntityType) {
    const organizationId = principal.organizationId;
    const [users, tags, pipelines, customFields, webhookSubscriptions, emailTemplates] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { organizationId, status: 'ACTIVE' },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        }),
        entityType === AutomationEntityType.LEAD || entityType === AutomationEntityType.PROJECT
          ? this.prisma.tag.findMany({
              where: { organizationId },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [],
        entityType === AutomationEntityType.LEAD
          ? this.prisma.pipeline.findMany({
              where: { organizationId, archivedAt: null },
              select: {
                id: true,
                name: true,
                stages: { select: { id: true, name: true }, orderBy: { position: 'asc' } },
              },
              orderBy: { name: 'asc' },
            })
          : [],
        entityType === AutomationEntityType.LEAD || entityType === AutomationEntityType.PROJECT
          ? this.prisma.customFieldDefinition.findMany({
              where: { organizationId, entityType, active: true },
              select: { id: true, name: true, fieldType: true, options: true },
              orderBy: { position: 'asc' },
            })
          : [],
        this.prisma.webhookSubscription.findMany({
          where: {
            organizationId,
            active: true,
            connection: { status: 'ACTIVE', direction: { in: ['OUTBOUND', 'BOTH'] } },
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.emailTemplate.findMany({
          where: { organizationId, active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);
    return { users, tags, pipelines, customFields, webhookSubscriptions, emailTemplates };
  }

  async getRule(principal: AuthenticatedPrincipal, id: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!rule) throw new NotFoundException('Automation rule not found');
    return rule;
  }

  async createRule(principal: AuthenticatedPrincipal, dto: CreateAutomationRuleDto) {
    const definition = await this.compileDefinition(principal.organizationId, dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rule = await tx.automationRule.create({
          data: {
            organizationId: principal.organizationId,
            createdById: principal.userId,
            name: definition.name.trim(),
            entityType: definition.entityType,
            triggerType: definition.triggerType,
            triggerConfig: this.jsonOrNull(definition.triggerConfig),
            conditions: this.jsonRequired(definition.conditions),
            actions: this.jsonRequired(definition.actions),
            graphMetadata: this.jsonRequired(definition.graphMetadata),
            active: definition.active ?? true,
          },
        });
        await this.audit.create(
          {
            organizationId: principal.organizationId,
            actorId: principal.userId,
            entityType: 'AUTOMATION',
            entityId: rule.id,
            action: 'AUTOMATION_CREATED',
          },
          tx,
        );
        return rule;
      });
    } catch (error) {
      if (this.uniqueConflict(error))
        throw new ConflictException('An automation with this name already exists');
      throw error;
    }
  }

  async updateRule(principal: AuthenticatedPrincipal, id: string, dto: UpdateAutomationRuleDto) {
    const existing = await this.getRule(principal, id);
    const baseDefinition: CreateAutomationRuleDto = {
      name: dto.name ?? existing.name,
      entityType: dto.entityType ?? existing.entityType,
      triggerType: dto.triggerType ?? existing.triggerType,
      triggerConfig:
        dto.triggerConfig ?? (existing.triggerConfig as AutomationTriggerConfigDto | undefined),
      conditions: dto.conditions ?? (existing.conditions as unknown as AutomationConditionDto[]),
      actions: dto.actions ?? (existing.actions as unknown as AutomationActionDto[]),
      active: dto.active ?? existing.active,
      graphMetadata:
        dto.graphMetadata ??
        (existing.graphMetadata as Record<string, unknown> | null | undefined) ??
        undefined,
    };
    const definition = await this.compileDefinition(
      principal.organizationId,
      baseDefinition,
      dto.graphMetadata === undefined,
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rule = await tx.automationRule.update({
          where: { id },
          data: {
            name: definition.name.trim(),
            entityType: definition.entityType,
            triggerType: definition.triggerType,
            triggerConfig: this.jsonOptional(definition.triggerConfig),
            conditions: this.jsonRequired(definition.conditions),
            actions: this.jsonRequired(definition.actions),
            graphMetadata: this.jsonRequired(definition.graphMetadata),
            active: definition.active,
          },
        });
        await this.audit.create(
          {
            organizationId: principal.organizationId,
            actorId: principal.userId,
            entityType: 'AUTOMATION',
            entityId: id,
            action: 'AUTOMATION_UPDATED',
            metadata: { active: rule.active },
          },
          tx,
        );
        return rule;
      });
    } catch (error) {
      if (this.uniqueConflict(error))
        throw new ConflictException('An automation with this name already exists');
      throw error;
    }
  }

  async listRuns(principal: AuthenticatedPrincipal, ruleId: string) {
    await this.getRule(principal, ruleId);
    const runs = await this.prisma.automationRun.findMany({
      where: { organizationId: principal.organizationId, automationRuleId: ruleId },
      include: { automationRule: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return Promise.all(runs.map((run) => this.describeRun(run)));
  }

  async retryRun(principal: AuthenticatedPrincipal, id: string) {
    const run = await this.prisma.automationRun.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!run) throw new NotFoundException('Automation run not found');
    if (
      run.status !== AutomationRunStatus.FAILED ||
      !run.retryable ||
      run.attemptCount >= AUTOMATION_MAX_ATTEMPTS
    )
      throw new ConflictException('Automation run is not eligible for retry');
    await this.prisma.automationRun.update({
      where: { id },
      data: { status: 'PENDING', errorSummary: null, completedAt: null },
    });
    await this.jobs.enqueueAutomationRun(id);
    await this.audit.create({
      organizationId: principal.organizationId,
      actorId: principal.userId,
      entityType: 'AUTOMATION_RUN',
      entityId: id,
      action: 'AUTOMATION_RUN_RETRIED',
    });
    return { accepted: true };
  }

  async publishBusinessEvent(
    organizationId: string,
    eventType: AutomationEventType,
    entityId: string,
    data: Record<string, unknown>,
    context: { depth?: number; triggerEventId?: string } = {},
  ) {
    const mapping = AUTOMATION_EVENT_MAP[eventType];
    const triggerEventId: string = context.triggerEventId ?? randomUUID();
    await this.integrations.publishBusinessEvent(
      organizationId,
      eventType,
      entityId,
      data,
      triggerEventId.slice(0, 160),
    );
    const depth = context.depth ?? 0;
    if (depth >= AUTOMATION_MAX_DEPTH) {
      this.logger.warn(
        `Automation depth limit reached event=${eventType} entityId=${entityId} depth=${depth}`,
      );
      return { queued: 0, triggerEventId };
    }
    const snapshot = await this.snapshotEntity(organizationId, mapping.entityType, entityId);
    const triggerPayload = { eventType, ...data, snapshot };
    const rules = await this.prisma.automationRule.findMany({
      where: {
        organizationId,
        active: true,
        entityType: mapping.entityType,
        triggerType: mapping.triggerType,
      },
    });
    let queued = 0;
    for (const rule of rules) {
      if (!this.matchesTriggerConfig(rule.triggerConfig, data)) continue;
      const run = await this.prisma.automationRun.upsert({
        where: {
          automationRuleId_triggerEventId: { automationRuleId: rule.id, triggerEventId },
        },
        create: {
          organizationId,
          automationRuleId: rule.id,
          triggerEventId,
          entityType: mapping.entityType,
          entityId,
          depth,
          triggerPayload: this.jsonRequired(triggerPayload),
        },
        update: {},
      });
      if (run.status === AutomationRunStatus.PENDING) {
        await this.jobs.enqueueAutomationRun(run.id).catch((error: unknown) => {
          this.logger.error(
            `Failed to enqueue automation run=${run.id}: ${this.errorSummary(error)}`,
          );
        });
        queued += 1;
      }
    }
    return { queued, triggerEventId };
  }

  async processRun(id: string) {
    const current = await this.prisma.automationRun.findUnique({
      where: { id },
      include: { automationRule: true },
    });
    if (
      !current ||
      (current.status !== AutomationRunStatus.PENDING &&
        current.status !== AutomationRunStatus.FAILED) ||
      current.attemptCount >= AUTOMATION_MAX_ATTEMPTS
    )
      return;
    const claim = await this.prisma.automationRun.updateMany({
      where: { id, status: current.status, attemptCount: current.attemptCount },
      data: { status: 'PROCESSING', attemptCount: { increment: 1 }, startedAt: new Date() },
    });
    if (claim.count !== 1) return;
    const run = await this.prisma.automationRun.findUniqueOrThrow({
      where: { id },
      include: { automationRule: true },
    });
    if (!run.automationRule.active) {
      await this.finishRun(id, 'SKIPPED', false, 'Automation was disabled before execution');
      return;
    }
    const payload = run.triggerPayload as Record<string, unknown>;
    const snapshot = payload.snapshot as Snapshot;
    const conditions = run.automationRule.conditions as unknown as AutomationConditionDto[];
    if (!conditions.every((condition) => this.evaluateCondition(snapshot, condition))) {
      await this.finishRun(id, 'SKIPPED', false, null);
      return;
    }
    const actions = run.automationRule.actions as unknown as AutomationActionDto[];
    const results = this.actionResults(run.actionResults);
    try {
      for (let index = 0; index < actions.length; index += 1) {
        if (
          results.some(
            (result) =>
              result.index === index &&
              (result.status === 'SUCCEEDED' || result.status === 'SKIPPED'),
          )
        )
          continue;
        try {
          const result = await this.executeAction(run, snapshot, actions[index]!, index);
          this.replaceActionResult(results, result);
          await this.prisma.automationRun.update({
            where: { id },
            data: { actionResults: this.jsonRequired(results) },
          });
        } catch (error) {
          const result = this.result(
            index,
            actions[index]!.type,
            this.errorSummary(error),
            new Date().toISOString(),
            'FAILED',
          );
          this.replaceActionResult(results, result);
          await this.prisma.automationRun.update({
            where: { id },
            data: { actionResults: this.jsonRequired(results) },
          });
          throw error;
        }
      }
      await this.finishRun(id, 'SUCCEEDED', false, null);
      this.logger.log(`Automation run succeeded run=${id} actions=${actions.length}`);
    } catch (error) {
      const retryable = this.isTransient(error) && run.attemptCount < AUTOMATION_MAX_ATTEMPTS;
      await this.finishRun(id, 'FAILED', retryable, this.errorSummary(error));
      if (retryable) throw error;
    }
  }

  async recoverPendingRuns() {
    const runs = await this.prisma.automationRun.findMany({
      where: { status: 'PENDING', automationRule: { active: true } },
      select: { id: true },
      take: 100,
    });
    const results = await Promise.allSettled(
      runs.map(({ id }) => this.jobs.enqueueAutomationRun(id)),
    );
    const failures = results.filter(({ status }) => status === 'rejected').length;
    if (runs.length || failures)
      this.logger.log(`Automation recovery queued=${runs.length} failures=${failures}`);
    return { runs: runs.length };
  }

  private async executeAction(
    run: RunWithRule,
    snapshot: Snapshot,
    action: AutomationActionDto,
    index: number,
  ): Promise<ActionResult> {
    const completedAt = new Date().toISOString();
    if (action.type === 'ADD_TAG' || action.type === 'REMOVE_TAG') {
      const tagId = action.tagId!;
      if (action.type === 'ADD_TAG')
        await this.prisma.entityTag.upsert({
          where: {
            tagId_entityType_entityId: {
              tagId,
              entityType: run.entityType as 'LEAD' | 'PROJECT',
              entityId: run.entityId,
            },
          },
          create: {
            organizationId: run.organizationId,
            tagId,
            entityType: run.entityType as 'LEAD' | 'PROJECT',
            entityId: run.entityId,
          },
          update: {},
        });
      else
        await this.prisma.entityTag.deleteMany({
          where: {
            organizationId: run.organizationId,
            tagId,
            entityType: run.entityType as 'LEAD' | 'PROJECT',
            entityId: run.entityId,
          },
        });
      return this.result(
        index,
        action.type,
        `${action.type === 'ADD_TAG' ? 'Added' : 'Removed'} tag`,
        completedAt,
      );
    }
    if (action.type === 'ASSIGN_OWNER') {
      if (run.entityType === 'LEAD')
        await this.prisma.lead.update({
          where: { id: run.entityId },
          data: { ownerId: action.ownerId },
        });
      else if (run.entityType === 'PROJECT')
        await this.prisma.project.update({
          where: { id: run.entityId },
          data: { projectManagerId: action.ownerId },
        });
      else
        await this.prisma.task.update({
          where: { id: run.entityId },
          data: { assigneeId: action.ownerId },
        });
      return this.result(index, action.type, 'Assigned owner', completedAt);
    }
    if (action.type === 'CHANGE_PRIORITY') {
      if (run.entityType === 'LEAD')
        await this.prisma.lead.update({
          where: { id: run.entityId },
          data: { priority: action.priority },
        });
      else if (run.entityType === 'PROJECT')
        await this.prisma.project.update({
          where: { id: run.entityId },
          data: { priority: action.priority },
        });
      else
        await this.prisma.task.update({
          where: { id: run.entityId },
          data: { priority: action.priority },
        });
      return this.result(index, action.type, `Changed priority to ${action.priority}`, completedAt);
    }
    if (action.type === 'CREATE_FOLLOW_UP') {
      const dueAt = this.addDays(new Date(), action.dueInDays ?? 1);
      const followUp = await this.prisma.followUp.create({
        data: {
          organizationId: run.organizationId,
          leadId: run.entityId,
          dueAt,
          type: action.followUpType ?? 'CALL',
          notes: action.notes,
          assignedToId: action.ownerId ?? (snapshot.ownerId as string | null),
          createdById: run.automationRule.createdById,
        },
      });
      return this.result(index, action.type, `Created follow-up ${followUp.id}`, completedAt);
    }
    if (action.type === 'CREATE_TASK') {
      const projectId = this.projectId(run.entityType, run.entityId, snapshot);
      if (!projectId)
        throw new BadRequestException('Automation entity has no project for task creation');
      const task = await this.prisma.task.create({
        data: {
          organizationId: run.organizationId,
          projectId,
          title: action.title ?? `Automation: ${run.automationRule.name}`,
          description: action.notes,
          assigneeId: action.ownerId ?? (snapshot.ownerId as string | null),
          reporterId: run.automationRule.createdById,
          createdById: run.automationRule.createdById,
          priority: action.priority ?? 'MEDIUM',
          dueDate: this.addDays(new Date(), action.dueInDays ?? 1),
        },
      });
      await this.publishBusinessEvent(
        run.organizationId,
        'task.created',
        task.id,
        { title: task.title, status: task.status, projectId: task.projectId },
        { depth: run.depth + 1 },
      );
      return this.result(index, action.type, `Created task ${task.id}`, completedAt);
    }
    if (action.type === 'CREATE_NOTIFICATION') {
      const userId = action.ownerId ?? (snapshot.ownerId as string | null);
      if (!userId) throw new BadRequestException('Automation entity has no notification recipient');
      const recipient = await this.activeUser(run.organizationId, userId);
      if (!recipient) throw new BadRequestException('Automation notification recipient is invalid');
      const notification = await this.prisma.notification.upsert({
        where: {
          organizationId_userId_dedupeKey: {
            organizationId: run.organizationId,
            userId,
            dedupeKey: `automation:${run.id}:${index}`,
          },
        },
        create: {
          organizationId: run.organizationId,
          userId,
          type: 'AUTOMATION',
          title: action.title ?? run.automationRule.name,
          message: action.message ?? `Automation completed for ${run.entityType.toLowerCase()}.`,
          entityType: run.entityType,
          entityId: run.entityId,
          dedupeKey: `automation:${run.id}:${index}`,
        },
        update: {},
      });
      if (notification.organizationId !== run.organizationId || notification.userId !== userId)
        throw new BadRequestException('Automation notification persistence failed');
      return this.result(
        index,
        action.type,
        `Created notification for ${this.userLabel(recipient)}`,
        completedAt,
      );
    }
    if (action.type === 'SEND_EMAIL') {
      const message = await this.crmEmail.sendAutomation({
        organizationId: run.organizationId,
        senderUserId: run.automationRule.createdById,
        entityType: run.entityType,
        entityId: run.entityId,
        templateId: action.emailTemplateId!,
        recipientSource: action.recipientSource!,
        idempotencyKey: `automation:${run.id}:${index}`,
      });
      return this.result(index, action.type, `Queued email ${message.id}`, completedAt);
    }
    const delivery = await this.integrations.triggerConfiguredWebhook({
      organizationId: run.organizationId,
      subscriptionId: action.webhookSubscriptionId!,
      eventType: (run.triggerPayload as Record<string, unknown>).eventType as string,
      entityId: run.entityId,
      payload: run.triggerPayload as Record<string, unknown>,
      idempotencyKey: `automation:${run.id}:${index}`,
    });
    return this.result(index, action.type, `Queued webhook delivery ${delivery.id}`, completedAt);
  }

  private async compileDefinition(
    organizationId: string,
    definition: CreateAutomationRuleDto,
    preferFormDefinition = false,
  ): Promise<CompiledAutomationDefinition> {
    const graph =
      definition.graphMetadata && !preferFormDefinition
        ? this.compileGraph(definition.graphMetadata)
        : {
            entityType: definition.entityType,
            triggerType: definition.triggerType,
            triggerConfig: definition.triggerConfig,
            conditions: definition.conditions,
            actions: definition.actions,
            graphMetadata: this.graphFromDefinition(definition),
          };
    const compiled: CompiledAutomationDefinition = {
      name: definition.name,
      entityType: graph.entityType,
      triggerType: graph.triggerType,
      triggerConfig: graph.triggerConfig,
      conditions: graph.conditions,
      actions: graph.actions,
      active: definition.active,
      graphMetadata: graph.graphMetadata,
    };
    await this.validateDefinition(organizationId, compiled);
    return compiled;
  }

  private compileGraph(value: Record<string, unknown>) {
    const graph = value as AutomationGraphMetadata;
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
      throw new BadRequestException('Automation graph must include nodes and edges');
    if (graph.nodes.length < 2 || graph.nodes.length > 30)
      throw new BadRequestException('Automation graph must include 2 to 30 nodes');
    if (graph.edges.length > 40)
      throw new BadRequestException('Automation graph has too many edges');

    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (
        !node ||
        typeof node.id !== 'string' ||
        !/^[a-zA-Z0-9:_-]{1,80}$/.test(node.id) ||
        !['trigger', 'condition', 'action'].includes(node.type)
      )
        throw new BadRequestException('Automation graph contains an invalid node');
      if (ids.has(node.id))
        throw new BadRequestException('Automation graph contains duplicate nodes');
      ids.add(node.id);
    }
    const triggerNodes = graph.nodes.filter(({ type }) => type === 'trigger');
    if (triggerNodes.length !== 1)
      throw new BadRequestException('Automation graph must contain exactly one trigger');
    const actionNodes = graph.nodes.filter(({ type }) => type === 'action');
    if (!actionNodes.length)
      throw new BadRequestException('Automation graph must contain an action');

    const outgoing = new Map<string, AutomationGraphEdge[]>();
    const incoming = new Map<string, number>();
    for (const edge of graph.edges) {
      if (!edge || typeof edge.source !== 'string' || typeof edge.target !== 'string')
        throw new BadRequestException('Automation graph contains an invalid connection');
      if (!ids.has(edge.source) || !ids.has(edge.target))
        throw new BadRequestException('Automation graph connection references an unknown node');
      if (edge.source === edge.target)
        throw new BadRequestException('Automation graph cycles are not supported');
      if (edge.sourceHandle === 'false')
        throw new BadRequestException('False condition branches must end without required actions');
      outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    }
    if (incoming.has(triggerNodes[0]!.id))
      throw new BadRequestException('Automation graph trigger must be the root node');
    for (const node of graph.nodes) {
      if (node.type !== 'trigger' && !incoming.has(node.id))
        throw new BadRequestException('Automation graph contains disconnected nodes');
      if ((outgoing.get(node.id) ?? []).length > 1)
        throw new BadRequestException('Automation graph must use one controlled path');
    }

    const ordered = this.orderedGraphNodes(triggerNodes[0]!.id, graph.nodes, outgoing);
    if (ordered.length !== graph.nodes.length)
      throw new BadRequestException('Automation graph contains disconnected nodes');
    const firstAction = ordered.findIndex(({ type }) => type === 'action');
    if (firstAction < 0) throw new BadRequestException('Automation graph must contain an action');
    if (ordered.slice(firstAction).some(({ type }) => type === 'condition'))
      throw new BadRequestException('Automation graph conditions must come before actions');

    const triggerData = this.objectData(triggerNodes[0]!);
    const entityType = triggerData.entityType as AutomationEntityType;
    const triggerType = triggerData.triggerType as AutomationTriggerType;
    const triggerConfig = this.optionalObject(triggerData.triggerConfig) as
      AutomationTriggerConfigDto | undefined;
    const conditions = ordered
      .filter(({ type }) => type === 'condition')
      .map((node) => this.objectData(node).condition as AutomationConditionDto);
    const actions = ordered
      .filter(({ type }) => type === 'action')
      .map((node) => this.objectData(node).action as AutomationActionDto);
    return {
      entityType,
      triggerType,
      triggerConfig,
      conditions,
      actions,
      graphMetadata: this.normalizedGraph(graph),
    };
  }

  private orderedGraphNodes(
    triggerId: string,
    nodes: AutomationGraphNode[],
    outgoing: Map<string, AutomationGraphEdge[]>,
  ) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const ordered: AutomationGraphNode[] = [];
    const seen = new Set<string>();
    let currentId: string | undefined = triggerId;
    while (currentId) {
      if (seen.has(currentId))
        throw new BadRequestException('Automation graph cycles are not supported');
      const node = byId.get(currentId);
      if (!node) throw new BadRequestException('Automation graph contains an invalid connection');
      seen.add(currentId);
      ordered.push(node);
      const next: string | undefined = outgoing.get(currentId)?.[0]?.target;
      currentId = next;
    }
    return ordered;
  }

  private objectData(node: AutomationGraphNode) {
    if (!node.data || typeof node.data !== 'object' || Array.isArray(node.data))
      throw new BadRequestException('Automation graph node configuration is invalid');
    return node.data;
  }

  private optionalObject(value: unknown) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Automation graph trigger configuration is invalid');
    return value;
  }

  private normalizedGraph(graph: AutomationGraphMetadata): AutomationGraphMetadata {
    return {
      version: 1,
      nodes: graph.nodes!.map((node) => ({
        id: node.id,
        type: node.type,
        position: {
          x: typeof node.position?.x === 'number' ? node.position.x : 0,
          y: typeof node.position?.y === 'number' ? node.position.y : 0,
        },
        data: node.data,
      })),
      edges: graph.edges!.map((edge, index) => ({
        id: typeof edge.id === 'string' ? edge.id : `edge-${index}`,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? null,
      })),
      viewport:
        graph.viewport && typeof graph.viewport === 'object' && !Array.isArray(graph.viewport)
          ? graph.viewport
          : undefined,
    };
  }

  private graphFromDefinition(definition: CreateAutomationRuleDto): AutomationGraphMetadata {
    const nodes: AutomationGraphNode[] = [
      {
        id: 'trigger',
        type: 'trigger',
        position: { x: 80, y: 80 },
        data: {
          entityType: definition.entityType,
          triggerType: definition.triggerType,
          triggerConfig: definition.triggerConfig,
        },
      },
    ];
    const edges: AutomationGraphEdge[] = [];
    let previous = 'trigger';
    definition.conditions.forEach((condition, index) => {
      const id = `condition-${index + 1}`;
      nodes.push({
        id,
        type: 'condition',
        position: { x: 80, y: 220 + index * 140 },
        data: { condition },
      });
      edges.push({ id: `${previous}-${id}`, source: previous, target: id, sourceHandle: 'true' });
      previous = id;
    });
    definition.actions.forEach((action, index) => {
      const id = `action-${index + 1}`;
      nodes.push({
        id,
        type: 'action',
        position: { x: 80, y: 220 + (definition.conditions.length + index) * 140 },
        data: { action },
      });
      edges.push({ id: `${previous}-${id}`, source: previous, target: id, sourceHandle: 'true' });
      previous = id;
    });
    return { version: 1, nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
  }

  private async validateDefinition(organizationId: string, definition: CreateAutomationRuleDto) {
    const expected = Object.entries(AUTOMATION_EVENT_MAP).find(
      ([, value]) => value.triggerType === definition.triggerType,
    )?.[1];
    if (!expected || expected.entityType !== definition.entityType)
      throw new BadRequestException('Trigger is not valid for the selected entity type');
    await this.validateTriggerConfig(
      organizationId,
      definition.triggerType,
      definition.triggerConfig,
    );
    for (const condition of definition.conditions)
      await this.validateCondition(organizationId, definition.entityType, condition);
    for (const action of definition.actions)
      await this.validateAction(organizationId, definition.entityType, action);
  }

  private async validateTriggerConfig(
    organizationId: string,
    triggerType: AutomationTriggerType,
    config?: AutomationTriggerConfigDto,
  ) {
    if (!config || (!config.from && !config.to)) return;
    const changed = [
      AutomationTriggerType.LEAD_STAGE_CHANGED,
      AutomationTriggerType.LEAD_OWNER_CHANGED,
      AutomationTriggerType.PROJECT_STATUS_CHANGED,
      AutomationTriggerType.TASK_STATUS_CHANGED,
      AutomationTriggerType.QUOTATION_STATUS_CHANGED,
    ];
    if (!changed.some((value) => value === triggerType))
      throw new BadRequestException('Trigger configuration is only valid for change triggers');
    for (const value of [config.from, config.to].filter(Boolean) as string[]) {
      if (triggerType === AutomationTriggerType.LEAD_STAGE_CHANGED) {
        if (!(await this.prisma.pipelineStage.findFirst({ where: { id: value, organizationId } })))
          throw new BadRequestException('Trigger stage is invalid');
      } else if (triggerType === AutomationTriggerType.LEAD_OWNER_CHANGED) {
        if (!(await this.activeUser(organizationId, value)))
          throw new BadRequestException('Trigger owner is invalid');
      } else {
        const values =
          triggerType === AutomationTriggerType.PROJECT_STATUS_CHANGED
            ? Object.values(ProjectStatus)
            : triggerType === AutomationTriggerType.TASK_STATUS_CHANGED
              ? Object.values(TaskStatus)
              : Object.values(QuotationStatus);
        if (!values.includes(value as never))
          throw new BadRequestException('Trigger status is invalid');
      }
    }
  }

  private async validateCondition(
    organizationId: string,
    entityType: AutomationEntityType,
    condition: AutomationConditionDto,
  ) {
    const fields: Record<AutomationEntityType, string[]> = {
      LEAD: [
        'stageId',
        'ownerId',
        'priority',
        'tagIds',
        'pipelineId',
        'estimatedValue',
        'customField',
      ],
      PROJECT: ['status', 'ownerId', 'priority', 'tagIds', 'amount', 'customField'],
      TASK: ['status', 'ownerId', 'priority'],
      QUOTATION: ['status', 'ownerId', 'amount'],
      PAYMENT: ['ownerId', 'amount'],
    };
    if (!fields[entityType].includes(condition.field))
      throw new BadRequestException('Condition field is not supported for this entity type');
    const emptyOperator = ['IS_EMPTY', 'IS_NOT_EMPTY'].includes(condition.operator);
    if (!emptyOperator && condition.value === undefined)
      throw new BadRequestException('Condition value is required');
    if (emptyOperator && condition.value !== undefined)
      throw new BadRequestException('Empty checks do not accept a condition value');
    if (
      !emptyOperator &&
      condition.value !== null &&
      !['string', 'number', 'boolean'].includes(typeof condition.value)
    )
      throw new BadRequestException('Condition value must be a string, number, or boolean');
    if (
      !emptyOperator &&
      ['amount', 'estimatedValue'].includes(condition.field) &&
      (typeof condition.value !== 'number' || !Number.isFinite(condition.value))
    )
      throw new BadRequestException('Numeric condition value is invalid');
    if (['GREATER_THAN', 'LESS_THAN'].includes(condition.operator)) {
      if (!['amount', 'estimatedValue', 'customField'].includes(condition.field))
        throw new BadRequestException('Numeric operators require a numeric field');
      if (typeof condition.value !== 'number' || !Number.isFinite(condition.value))
        throw new BadRequestException('Numeric condition value is invalid');
    }
    if (condition.operator === 'CONTAINS' && !['tagIds', 'customField'].includes(condition.field))
      throw new BadRequestException('Contains is not supported for this field');
    if (condition.field === 'customField') {
      if (!condition.fieldDefinitionId)
        throw new BadRequestException('Custom-field condition requires a field definition');
      const definition = await this.prisma.customFieldDefinition.findFirst({
        where: {
          id: condition.fieldDefinitionId,
          organizationId,
          entityType: entityType as 'LEAD' | 'PROJECT',
          active: true,
        },
      });
      if (!definition) throw new BadRequestException('Custom-field definition is invalid');
      if (
        ['GREATER_THAN', 'LESS_THAN'].includes(condition.operator) &&
        definition.fieldType !== 'NUMBER' &&
        definition.fieldType !== 'CURRENCY'
      )
        throw new BadRequestException('Numeric operators require a numeric custom field');
      if (!emptyOperator) this.validateCustomFieldConditionValue(definition, condition.value);
    } else if (condition.fieldDefinitionId) {
      throw new BadRequestException('Field definition is only valid for custom-field conditions');
    }
    if (condition.field === 'tagIds') await this.requireTag(organizationId, condition.value);
    if (
      condition.field === 'ownerId' &&
      condition.value &&
      !(await this.activeUser(organizationId, condition.value))
    )
      throw new BadRequestException('Condition owner is invalid');
    if (condition.field === 'stageId' && condition.value) {
      if (typeof condition.value !== 'string')
        throw new BadRequestException('Condition stage is invalid');
      if (
        !(await this.prisma.pipelineStage.findFirst({
          where: { id: condition.value, organizationId },
        }))
      )
        throw new BadRequestException('Condition stage is invalid');
    }
    if (condition.field === 'pipelineId' && condition.value) {
      if (typeof condition.value !== 'string')
        throw new BadRequestException('Condition pipeline is invalid');
      if (
        !(await this.prisma.pipeline.findFirst({
          where: { id: condition.value, organizationId, archivedAt: null },
        }))
      )
        throw new BadRequestException('Condition pipeline is invalid');
    }
    if (condition.field === 'priority' && !emptyOperator) {
      const priorities =
        entityType === AutomationEntityType.LEAD
          ? Object.values(LeadPriority)
          : Object.values(WorkPriority);
      if (
        typeof condition.value !== 'string' ||
        !priorities.some((value) => value === condition.value)
      )
        throw new BadRequestException('Condition priority is invalid');
    }
    if (condition.field === 'status' && !emptyOperator) {
      const statuses =
        entityType === AutomationEntityType.PROJECT
          ? Object.values(ProjectStatus)
          : entityType === AutomationEntityType.TASK
            ? Object.values(TaskStatus)
            : Object.values(QuotationStatus);
      if (
        typeof condition.value !== 'string' ||
        !statuses.some((value) => value === condition.value)
      )
        throw new BadRequestException('Condition status is invalid');
    }
  }

  private async validateAction(
    organizationId: string,
    entityType: AutomationEntityType,
    action: AutomationActionDto,
  ) {
    const allowed: Record<string, string[]> = {
      CREATE_TASK: ['type', 'title', 'notes', 'ownerId', 'priority', 'dueInDays'],
      CREATE_FOLLOW_UP: ['type', 'notes', 'ownerId', 'followUpType', 'dueInDays'],
      ADD_TAG: ['type', 'tagId'],
      REMOVE_TAG: ['type', 'tagId'],
      ASSIGN_OWNER: ['type', 'ownerId'],
      CHANGE_PRIORITY: ['type', 'priority'],
      CREATE_NOTIFICATION: ['type', 'title', 'message', 'ownerId'],
      TRIGGER_WEBHOOK: ['type', 'webhookSubscriptionId'],
      SEND_EMAIL: ['type', 'emailTemplateId', 'recipientSource'],
    };
    const unexpected = Object.entries(action).find(
      ([key, value]) => value !== undefined && !allowed[action.type]!.includes(key),
    );
    if (unexpected)
      throw new BadRequestException(`${unexpected[0]} is not valid for ${action.type}`);
    if (action.type === 'CREATE_FOLLOW_UP' && entityType !== AutomationEntityType.LEAD)
      throw new BadRequestException('Follow-ups can only be created for leads');
    if (['ADD_TAG', 'REMOVE_TAG'].includes(action.type)) {
      if (entityType !== AutomationEntityType.LEAD && entityType !== AutomationEntityType.PROJECT)
        throw new BadRequestException('Tags are not supported for this automation entity');
      await this.requireTag(organizationId, action.tagId);
    }
    if (action.type === 'ASSIGN_OWNER') {
      if (
        entityType !== AutomationEntityType.LEAD &&
        entityType !== AutomationEntityType.PROJECT &&
        entityType !== AutomationEntityType.TASK
      )
        throw new BadRequestException('Owner assignment is not supported for this entity');
      if (!action.ownerId || !(await this.activeUser(organizationId, action.ownerId)))
        throw new BadRequestException('Action owner is invalid');
    }
    if (action.type === 'CHANGE_PRIORITY') {
      if (
        entityType !== AutomationEntityType.LEAD &&
        entityType !== AutomationEntityType.PROJECT &&
        entityType !== AutomationEntityType.TASK
      )
        throw new BadRequestException('Priority is not supported for this entity');
      if (!action.priority) throw new BadRequestException('Action priority is required');
    }
    if (action.ownerId && !(await this.activeUser(organizationId, action.ownerId)))
      throw new BadRequestException('Action user is invalid');
    if (action.type === 'TRIGGER_WEBHOOK') {
      if (!action.webhookSubscriptionId)
        throw new BadRequestException('Outbound webhook subscription is required');
      const subscription = await this.prisma.webhookSubscription.findFirst({
        where: {
          id: action.webhookSubscriptionId,
          organizationId,
          active: true,
          connection: { status: 'ACTIVE', direction: { in: ['OUTBOUND', 'BOTH'] } },
        },
      });
      if (!subscription) throw new BadRequestException('Outbound webhook subscription is invalid');
    }
    if (action.type === 'SEND_EMAIL') {
      if (entityType !== AutomationEntityType.LEAD)
        throw new BadRequestException('Send email is currently supported for lead automations');
      if (!action.emailTemplateId || !action.recipientSource)
        throw new BadRequestException('Email template and recipient source are required');
      if (!['LEAD_EMAIL', 'PRIMARY_CONTACT'].includes(action.recipientSource))
        throw new BadRequestException('Recipient source is invalid for a lead');
      const template = await this.prisma.emailTemplate.findFirst({
        where: { id: action.emailTemplateId, organizationId, active: true },
        select: { id: true },
      });
      if (!template) throw new BadRequestException('Email template is invalid');
    }
  }

  private evaluateCondition(snapshot: Snapshot, condition: AutomationConditionDto) {
    const value =
      condition.field === 'customField'
        ? (snapshot.customFields as Record<string, unknown> | undefined)?.[
            condition.fieldDefinitionId!
          ]
        : snapshot[condition.field];
    if (condition.operator === 'IS_EMPTY') return this.empty(value);
    if (condition.operator === 'IS_NOT_EMPTY') return !this.empty(value);
    if (condition.operator === 'EQUALS') return this.equal(value, condition.value);
    if (condition.operator === 'NOT_EQUALS') return !this.equal(value, condition.value);
    if (condition.operator === 'CONTAINS')
      return Array.isArray(value)
        ? value.some((entry) => this.equal(entry, condition.value))
        : typeof value === 'string' && typeof condition.value === 'string'
          ? value.includes(condition.value)
          : false;
    const numeric = Number(value);
    const expected = Number(condition.value);
    if (!Number.isFinite(numeric) || !Number.isFinite(expected)) return false;
    return condition.operator === 'GREATER_THAN' ? numeric > expected : numeric < expected;
  }

  private async snapshotEntity(
    organizationId: string,
    entityType: AutomationEntityType,
    entityId: string,
  ): Promise<Snapshot> {
    let snapshot: Snapshot | null = null;
    if (entityType === AutomationEntityType.LEAD) {
      const entity = await this.prisma.lead.findFirst({
        where: { id: entityId, organizationId, archivedAt: null },
        select: {
          id: true,
          title: true,
          stageId: true,
          pipelineId: true,
          ownerId: true,
          priority: true,
          estimatedValue: true,
          project: { select: { id: true } },
        },
      });
      if (entity)
        snapshot = {
          ...entity,
          estimatedValue: entity.estimatedValue?.toNumber() ?? null,
          projectId: entity.project?.id ?? null,
        };
    } else if (entityType === AutomationEntityType.PROJECT) {
      const entity = await this.prisma.project.findFirst({
        where: { id: entityId, organizationId, archivedAt: null },
        select: {
          id: true,
          name: true,
          status: true,
          projectManagerId: true,
          priority: true,
          projectValue: true,
        },
      });
      if (entity)
        snapshot = {
          ...entity,
          ownerId: entity.projectManagerId,
          amount: entity.projectValue?.toNumber() ?? null,
        };
    } else if (entityType === AutomationEntityType.TASK) {
      const entity = await this.prisma.task.findFirst({
        where: { id: entityId, organizationId, archivedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          assigneeId: true,
          priority: true,
          projectId: true,
        },
      });
      if (entity) snapshot = { ...entity, ownerId: entity.assigneeId };
    } else if (entityType === AutomationEntityType.QUOTATION) {
      const entity = await this.prisma.quotation.findFirst({
        where: { id: entityId, organizationId, archivedAt: null },
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          total: true,
          createdById: true,
          projectId: true,
        },
      });
      if (entity)
        snapshot = { ...entity, ownerId: entity.createdById, amount: entity.total.toNumber() };
    } else {
      const entity = await this.prisma.payment.findFirst({
        where: { id: entityId, organizationId, archivedAt: null },
        select: { id: true, amount: true, recordedById: true, projectId: true },
      });
      if (entity)
        snapshot = { ...entity, ownerId: entity.recordedById, amount: entity.amount.toNumber() };
    }
    if (!snapshot) throw new NotFoundException('Automation entity not found');
    if (entityType === AutomationEntityType.LEAD || entityType === AutomationEntityType.PROJECT) {
      const [tags, customFields] = await Promise.all([
        this.prisma.entityTag.findMany({
          where: {
            organizationId,
            entityType,
            entityId,
          },
          select: { tagId: true },
        }),
        this.prisma.customFieldValue.findMany({
          where: {
            organizationId,
            entityType,
            entityId,
          },
          select: { fieldDefinitionId: true, value: true },
        }),
      ]);
      snapshot.tagIds = tags.map(({ tagId }) => tagId);
      snapshot.customFields = Object.fromEntries(
        customFields.map(({ fieldDefinitionId, value }) => [fieldDefinitionId, value]),
      );
    }
    return snapshot;
  }

  private matchesTriggerConfig(config: Prisma.JsonValue | null, data: Record<string, unknown>) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return true;
    const value = config as Record<string, unknown>;
    const from = data.fromStageId ?? data.fromOwnerId ?? data.fromStatus;
    const to = data.toStageId ?? data.toOwnerId ?? data.toStatus;
    return (!value.from || value.from === from) && (!value.to || value.to === to);
  }

  private async finishRun(
    id: string,
    status: AutomationRunStatus,
    retryable: boolean,
    errorSummary: string | null,
  ) {
    await this.prisma.automationRun.update({
      where: { id },
      data: { status, retryable, errorSummary, completedAt: new Date() },
    });
  }

  private async describeRun(run: RunWithRule) {
    const actions = run.automationRule.actions as unknown as AutomationActionDto[];
    const actionResults = this.actionResults(run.actionResults);
    const completedActions = actionResults.filter(({ status }) => status === 'SUCCEEDED').length;
    const failedAction = actionResults.find(({ status }) => status === 'FAILED');
    return {
      ...run,
      entityLabel: await this.entityLabel(run.organizationId, run.entityType, run.entityId),
      triggerSummary: await this.triggerSummary(
        run.organizationId,
        run.automationRule.triggerType,
        run.triggerPayload as Record<string, unknown>,
      ),
      conditionSummaries: await Promise.all(
        ((run.automationRule.conditions as unknown as AutomationConditionDto[]) ?? []).map(
          (condition) => this.conditionSummary(run.organizationId, run.entityType, condition),
        ),
      ),
      actionSummaries: await Promise.all(
        actions.map((action) => this.actionSummary(run.organizationId, action)),
      ),
      actionSummary: failedAction
        ? `${completedActions} of ${actions.length} actions completed`
        : `${completedActions || actionResults.length} actions completed`,
      actionResults,
      errorSummary: run.errorSummary ?? failedAction?.summary ?? null,
    };
  }

  private async entityLabel(
    organizationId: string,
    entityType: AutomationEntityType,
    entityId: string,
  ) {
    if (entityType === AutomationEntityType.LEAD) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: entityId, organizationId },
        select: { title: true },
      });
      return lead?.title ?? 'Unavailable lead';
    }
    if (entityType === AutomationEntityType.PROJECT) {
      const project = await this.prisma.project.findFirst({
        where: { id: entityId, organizationId },
        select: { name: true },
      });
      return project?.name ?? 'Unavailable project';
    }
    if (entityType === AutomationEntityType.TASK) {
      const task = await this.prisma.task.findFirst({
        where: { id: entityId, organizationId },
        select: { title: true },
      });
      return task?.title ?? 'Unavailable task';
    }
    if (entityType === AutomationEntityType.QUOTATION) {
      const quotation = await this.prisma.quotation.findFirst({
        where: { id: entityId, organizationId },
        select: { quotationNumber: true },
      });
      return quotation?.quotationNumber ?? 'Unavailable quotation';
    }
    const payment = await this.prisma.payment.findFirst({
      where: { id: entityId, organizationId },
      select: { amount: true, currency: true },
    });
    return payment ? `${payment.currency} ${payment.amount.toFixed(2)}` : 'Unavailable payment';
  }

  private async triggerSummary(
    organizationId: string,
    triggerType: AutomationTriggerType,
    payload: Record<string, unknown>,
  ) {
    if (triggerType === AutomationTriggerType.LEAD_STAGE_CHANGED)
      return `Lead stage changed -> ${await this.stageLabel(organizationId, payload.toStageId)}`;
    if (triggerType === AutomationTriggerType.LEAD_OWNER_CHANGED)
      return `Lead owner changed -> ${await this.userValueLabel(organizationId, payload.toOwnerId)}`;
    if (triggerType === AutomationTriggerType.PROJECT_STATUS_CHANGED)
      return `Project status changed -> ${this.valueLabel(payload.toStatus)}`;
    if (triggerType === AutomationTriggerType.TASK_STATUS_CHANGED)
      return `Task status changed -> ${this.valueLabel(payload.toStatus)}`;
    if (triggerType === AutomationTriggerType.QUOTATION_STATUS_CHANGED)
      return `Quotation status changed -> ${this.valueLabel(payload.toStatus)}`;
    if (triggerType === AutomationTriggerType.PAYMENT_CREATED) return 'Payment recorded';
    return this.valueLabel(triggerType);
  }

  private async conditionSummary(
    organizationId: string,
    entityType: AutomationEntityType,
    condition: AutomationConditionDto,
  ) {
    const field =
      condition.field === 'customField' && condition.fieldDefinitionId
        ? await this.customFieldLabel(organizationId, entityType, condition.fieldDefinitionId)
        : this.valueLabel(condition.field);
    const operator = this.valueLabel(condition.operator);
    if (condition.operator === 'IS_EMPTY' || condition.operator === 'IS_NOT_EMPTY')
      return `${field} ${operator}`;
    return `${field} ${operator} ${await this.conditionValueLabel(organizationId, condition)}`;
  }

  private async actionSummary(organizationId: string, action: AutomationActionDto) {
    if (action.type === 'ADD_TAG')
      return `Add tag - ${await this.tagLabel(organizationId, action.tagId)}`;
    if (action.type === 'REMOVE_TAG')
      return `Remove tag - ${await this.tagLabel(organizationId, action.tagId)}`;
    if (action.type === 'ASSIGN_OWNER')
      return `Assign owner - ${await this.userValueLabel(organizationId, action.ownerId)}`;
    if (action.type === 'CHANGE_PRIORITY')
      return `Change priority - ${this.valueLabel(action.priority)}`;
    if (action.type === 'CREATE_FOLLOW_UP')
      return `Create follow-up - +${action.dueInDays ?? 1} days - ${this.valueLabel(action.followUpType ?? 'CALL')} - ${action.ownerId ? await this.userValueLabel(organizationId, action.ownerId) : 'Entity owner'}`;
    if (action.type === 'CREATE_TASK')
      return `Create task - ${action.title?.trim() || 'Automation task'}`;
    if (action.type === 'CREATE_NOTIFICATION')
      return `Create notification - ${action.title?.trim() || 'Automation notification'} - ${action.ownerId ? await this.userValueLabel(organizationId, action.ownerId) : 'Entity owner'}`;
    if (action.type === 'SEND_EMAIL') {
      const template = action.emailTemplateId
        ? await this.prisma.emailTemplate.findFirst({
            where: { id: action.emailTemplateId, organizationId },
            select: { name: true },
          })
        : null;
      return `Send email - ${template?.name ?? 'Unknown template'} - ${this.valueLabel(action.recipientSource)}`;
    }
    return `Trigger webhook - ${action.webhookSubscriptionId ? 'Configured subscription' : 'No subscription'}`;
  }

  private async conditionValueLabel(organizationId: string, condition: AutomationConditionDto) {
    if (condition.field === 'ownerId') return this.userValueLabel(organizationId, condition.value);
    if (condition.field === 'tagIds') return this.tagLabel(organizationId, condition.value);
    if (condition.field === 'stageId') return this.stageLabel(organizationId, condition.value);
    if (condition.field === 'pipelineId')
      return this.pipelineLabel(organizationId, condition.value);
    return this.valueLabel(condition.value);
  }

  private async tagLabel(organizationId: string, value: unknown) {
    if (typeof value !== 'string') return 'Unknown tag';
    const tag = await this.prisma.tag.findFirst({
      where: { id: value, organizationId },
      select: { name: true },
    });
    return tag?.name ?? 'Unknown tag';
  }

  private async stageLabel(organizationId: string, value: unknown) {
    if (typeof value !== 'string') return 'Unknown stage';
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: value, organizationId },
      select: { name: true },
    });
    return stage?.name ?? 'Unknown stage';
  }

  private async pipelineLabel(organizationId: string, value: unknown) {
    if (typeof value !== 'string') return 'Unknown pipeline';
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: value, organizationId },
      select: { name: true },
    });
    return pipeline?.name ?? 'Unknown pipeline';
  }

  private async customFieldLabel(
    organizationId: string,
    entityType: AutomationEntityType,
    value: string,
  ) {
    const definition = await this.prisma.customFieldDefinition.findFirst({
      where: { id: value, organizationId, entityType: entityType as 'LEAD' | 'PROJECT' },
      select: { name: true },
    });
    return definition?.name ?? 'Unknown custom field';
  }

  private async userValueLabel(organizationId: string, value: unknown) {
    const user = await this.activeUser(organizationId, value);
    return user ? this.userLabel(user) : 'Unknown user';
  }

  private userLabel(user: { firstName: string; lastName: string; email: string }) {
    const name = `${user.firstName} ${user.lastName}`.trim();
    return name || user.email;
  }

  private valueLabel(value: unknown) {
    if (value === undefined || value === null) return 'None';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value !== 'string') return 'Configured value';
    return value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/^./, (character) => character.toUpperCase());
  }

  private actionResults(value: Prisma.JsonValue | null): ActionResult[] {
    return Array.isArray(value) ? (value as unknown as ActionResult[]) : [];
  }

  private result(
    index: number,
    type: string,
    summary: string,
    completedAt: string,
    status: ActionResult['status'] = 'SUCCEEDED',
  ): ActionResult {
    return { index, type, status, summary, completedAt };
  }

  private replaceActionResult(results: ActionResult[], result: ActionResult) {
    const existing = results.findIndex(({ index }) => index === result.index);
    if (existing >= 0) results[existing] = result;
    else results.push(result);
  }

  private projectId(entityType: AutomationEntityType, entityId: string, snapshot: Snapshot) {
    if (entityType === AutomationEntityType.PROJECT) return entityId;
    return typeof snapshot.projectId === 'string' ? snapshot.projectId : null;
  }

  private activeUser(organizationId: string, value: unknown) {
    if (typeof value !== 'string') return Promise.resolve(null);
    return this.prisma.user.findFirst({
      where: { id: value, organizationId, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }

  private validateCustomFieldConditionValue(
    definition: { fieldType: string; options: Prisma.JsonValue },
    value: unknown,
  ) {
    if (definition.fieldType === 'BOOLEAN' && typeof value !== 'boolean')
      throw new BadRequestException('Custom-field condition value must be boolean');
    if (
      (definition.fieldType === 'NUMBER' || definition.fieldType === 'CURRENCY') &&
      (typeof value !== 'number' || !Number.isFinite(value))
    )
      throw new BadRequestException('Custom-field condition value must be numeric');
    const options = Array.isArray(definition.options) ? definition.options : [];
    if (definition.fieldType === 'SELECT' && !options.includes(value as never))
      throw new BadRequestException('Custom-field condition option is invalid');
    if (
      definition.fieldType === 'MULTI_SELECT' &&
      (typeof value !== 'string' || !options.includes(value))
    )
      throw new BadRequestException('Custom-field condition option is invalid');
    if (
      !['BOOLEAN', 'NUMBER', 'CURRENCY', 'SELECT', 'MULTI_SELECT'].includes(definition.fieldType) &&
      typeof value !== 'string'
    )
      throw new BadRequestException('Custom-field condition value must be text');
  }

  private async requireTag(organizationId: string, value: unknown) {
    if (typeof value !== 'string') throw new BadRequestException('Tag is required');
    const tag = await this.prisma.tag.findFirst({ where: { id: value, organizationId } });
    if (!tag) throw new BadRequestException('Tag is invalid');
  }

  private isTransient(error: unknown) {
    if (error instanceof HttpException) return error.getStatus() >= 500;
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(error.code);
    return true;
  }

  private errorSummary(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const detail = typeof response === 'object' ? (response as { message?: unknown }) : null;
      const message =
        typeof response === 'string'
          ? response
          : Array.isArray(detail?.message)
            ? detail.message.join(', ')
            : typeof detail?.message === 'string'
              ? detail.message
              : 'Automation action was rejected';
      return message.replace(/\s+/g, ' ').slice(0, 1000);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return `Database operation failed (${error.code})`;
    return 'A transient automation execution error occurred';
  }

  private empty(value: unknown) {
    return (
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && !value.length)
    );
  }

  private equal(first: unknown, second: unknown) {
    return typeof first === 'number' || typeof second === 'number'
      ? Number(first) === Number(second)
      : first === second;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private jsonRequired(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private jsonOptional(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.JsonNullValueInput | undefined {
    return value === undefined ? undefined : (value as Prisma.InputJsonValue);
  }

  private jsonOrNull(value: unknown): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
    return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  }

  private uniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
