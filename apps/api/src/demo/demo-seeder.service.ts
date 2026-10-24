import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

const addDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const pick = <T>(items: readonly T[], index: number): T => items[index]!;

@Injectable()
export class DemoSeederService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async seed(organizationId: string, ownerId: string): Promise<void> {
    const seeded = await this.prisma.activityLog.findFirst({
      where: { organizationId, action: 'DEMO_WORKSPACE_SEEDED' },
      select: { id: true },
    });
    if (seeded) return;

    await this.prisma.$transaction(
      async (tx) => {
        const pipelines = await tx.pipeline.findMany({
          where: { organizationId },
          include: { stages: { orderBy: { position: 'asc' } } },
        });
        const leadPipeline = pipelines.find((pipeline) => pipeline.entityType === 'LEAD');
        const dealPipeline = pipelines.find((pipeline) => pipeline.entityType === 'DEAL');
        if (!leadPipeline?.stages.length || !dealPipeline?.stages.length)
          throw new Error('Demo pipelines are unavailable');

        const companyNames = [
          'Apex Commerce Ltd.',
          'Nova Digital',
          'GreenMart Ltd.',
          'Orbit Systems',
          'Vertex Healthcare',
        ];
        const companyIds = companyNames.map(() => randomUUID());
        await tx.company.createMany({
          data: companyNames.map((name, index) => ({
            id: companyIds[index],
            organizationId,
            name,
            industry: ['Retail', 'Technology', 'Commerce', 'SaaS', 'Healthcare'][index],
            status: index < 3 ? 'ACTIVE_CLIENT' : 'PROSPECT',
            accountOwnerId: ownerId,
            createdById: ownerId,
            city: 'Dhaka',
            country: 'Bangladesh',
          })),
        });

        const contactNames = [
          ['Amina', 'Rahman'],
          ['Farhan', 'Chowdhury'],
          ['Nadia', 'Islam'],
          ['Rafi', 'Ahmed'],
          ['Tania', 'Sultana'],
          ['Mahin', 'Karim'],
          ['Sara', 'Haque'],
          ['Imran', 'Kabir'],
          ['Maya', 'Hasan'],
        ] as const;
        const contactIds = contactNames.map(() => randomUUID());
        await tx.contact.createMany({
          data: contactNames.map(([firstName, lastName], index) => ({
            id: contactIds[index],
            organizationId,
            companyId: companyIds[index % companyIds.length],
            firstName,
            lastName,
            jobTitle: index % 2 ? 'Operations Manager' : 'Business Director',
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.invalid`,
            normalizedEmail: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.invalid`,
            isPrimary: index < companyIds.length,
            createdById: ownerId,
          })),
        });

        const leadTitles = [
          'Customer Portal Development',
          'Retail Analytics Rollout',
          'CRM Modernization',
          'Support Desk Migration',
          'Healthcare Appointment Portal',
          'Mobile Commerce Upgrade',
          'Data Operations Retainer',
          'Sales Enablement Platform',
          'Inventory Integration',
          'Customer Experience Audit',
        ];
        const leadIds = leadTitles.map(() => randomUUID());
        await tx.lead.createMany({
          data: leadTitles.map((title, index) => ({
            id: leadIds[index],
            organizationId,
            companyId: companyIds[index % companyIds.length],
            contactId: contactIds[index % contactIds.length],
            title,
            pipelineId: leadPipeline.id,
            stageId: pick(leadPipeline.stages, Math.min(index % leadPipeline.stages.length, 3)).id,
            estimatedValue: `${75_000 + index * 25_000}`,
            currency: 'BDT',
            ownerId,
            priority: index % 3 === 0 ? 'HIGH' : 'MEDIUM',
            source: ['REFERRAL', 'WEBSITE', 'LINKEDIN'][index % 3] as
              'REFERRAL' | 'WEBSITE' | 'LINKEDIN',
            nextFollowUpAt: addDays((index % 5) + 1),
            createdById: ownerId,
          })),
        });

        const dealIds = Array.from({ length: 6 }, () => randomUUID());
        await tx.deal.createMany({
          data: dealIds.map((id, index) => ({
            id,
            organizationId,
            name:
              index === 0
                ? 'Customer Portal Development Deal'
                : `${companyNames[index % companyNames.length]} Growth Program`,
            companyId: pick(companyIds, index % companyIds.length),
            contactId: pick(contactIds, index),
            ownerId,
            pipelineId: dealPipeline.id,
            stageId: pick(dealPipeline.stages, Math.min(index % dealPipeline.stages.length, 3)).id,
            amount: `${250_000 + index * 100_000}`,
            currency: 'BDT',
            probability: 20 + index * 10,
            expectedCloseDate: addDays(14 + index * 7),
            priority: index < 2 ? 'HIGH' : 'MEDIUM',
            createdById: ownerId,
          })),
        });

        const projectIds = Array.from({ length: 3 }, () => randomUUID());
        await tx.project.createMany({
          data: projectIds.map((id, index) => ({
            id,
            organizationId,
            companyId: pick(companyIds, index),
            sourceDealId: pick(dealIds, index),
            name: pick(
              ['Apex Customer Portal', 'Nova Analytics Launch', 'GreenMart CRM Rollout'],
              index,
            ),
            projectManagerId: ownerId,
            status: index === 2 ? 'PLANNED' : 'IN_PROGRESS',
            priority: index === 0 ? 'HIGH' : 'MEDIUM',
            startDate: addDays(-10 + index * 3),
            deadline: addDays(30 + index * 15),
            projectValue: `${350_000 + index * 150_000}`,
            currency: 'BDT',
            progress: pick([45, 25, 0], index),
            createdById: ownerId,
          })),
        });

        const taskIds = Array.from({ length: 12 }, () => randomUUID());
        await tx.task.createMany({
          data: taskIds.map((id, index) => ({
            id,
            organizationId,
            projectId: pick(projectIds, index % projectIds.length),
            title: pick(
              [
                'Confirm discovery scope',
                'Prepare solution architecture',
                'Review user journeys',
                'Configure sales pipeline',
                'Import sample catalog',
                'Run stakeholder workshop',
                'Complete dashboard review',
                'Prepare UAT checklist',
                'Validate quotation totals',
                'Schedule launch planning',
                'Document support workflow',
                'Review project handover',
              ],
              index,
            ),
            assigneeId: ownerId,
            reporterId: ownerId,
            createdById: ownerId,
            status: index < 2 ? 'COMPLETED' : index < 5 ? 'IN_PROGRESS' : 'TODO',
            priority: index % 4 === 0 ? 'HIGH' : 'MEDIUM',
            dueDate: addDays(index - 2),
            completedAt: index < 2 ? addDays(-1) : null,
          })),
        });

        await tx.scheduledActivity.createMany({
          data: [
            ['MEETING', 'Apex proposal review', 'DEAL', dealIds[0], 1],
            ['CALL', 'Nova stakeholder check-in', 'COMPANY', companyIds[1], 2],
            ['FOLLOW_UP', 'GreenMart implementation follow-up', 'LEAD', leadIds[2], 3],
            ['MEETING', 'Vertex discovery workshop', 'CONTACT', contactIds[4], 5],
          ].map(([type, subject, relatedEntityType, relatedEntityId, days]) => ({
            organizationId,
            type: type as 'MEETING' | 'CALL' | 'FOLLOW_UP',
            subject: subject as string,
            relatedEntityType: relatedEntityType as 'DEAL' | 'COMPANY' | 'LEAD' | 'CONTACT',
            relatedEntityId: relatedEntityId as string,
            ownerId,
            startAt: addDays(days as number),
            endAt: new Date(addDays(days as number).getTime() + 3_600_000),
            reminderAt: new Date(addDays(days as number).getTime() - 1_800_000),
            createdById: ownerId,
          })),
        });

        const category = await tx.catalogCategory.create({
          data: { organizationId, name: 'Digital Services' },
        });
        const catalogIds = Array.from({ length: 5 }, () => randomUUID());
        await tx.catalogItem.createMany({
          data: [
            ['Website Development', 'SERVICE', 'SRV-001', '150000'],
            ['UI/UX Design', 'SERVICE', 'SRV-002', '225000'],
            ['Maintenance', 'SERVICE', 'SRV-003', '300000'],
            ['Managed Support', 'SERVICE', 'SRV-004', '60000'],
            ['Data Migration Package', 'SERVICE', 'SRV-005', '85000'],
          ].map(([name, type, sku, unitPrice], index) => ({
            id: pick(catalogIds, index),
            organizationId,
            categoryId: category.id,
            name: name!,
            type: type as 'PRODUCT' | 'SERVICE',
            sku: sku!,
            unitPrice: unitPrice!,
            currency: 'BDT',
            createdById: ownerId,
          })),
        });

        const quotationIds = Array.from({ length: 4 }, () => randomUUID());
        await tx.quotation.createMany({
          data: quotationIds.map((id, index) => ({
            id,
            organizationId,
            quotationNumber: `DEMO-Q-${String(index + 1).padStart(3, '0')}`,
            companyId: pick(companyIds, index),
            contactId: pick(contactIds, index),
            dealId: pick(dealIds, index),
            projectId: index < 3 ? pick(projectIds, index) : null,
            status: ['ACCEPTED', 'SENT', 'DRAFT', 'SENT'][index] as 'ACCEPTED' | 'SENT' | 'DRAFT',
            issueDate: addDays(-7 + index),
            expiryDate: addDays(14 + index),
            currency: 'BDT',
            subtotal: `${150_000 + index * 75_000}`,
            total: `${150_000 + index * 75_000}`,
            createdById: ownerId,
            acceptedAt: index === 0 ? addDays(-3) : null,
            sentAt: index === 2 ? null : addDays(-5 + index),
          })),
        });
        await tx.quotationItem.createMany({
          data: quotationIds.map((quotationId, index) => ({
            organizationId,
            quotationId,
            catalogItemId: pick(catalogIds, index),
            catalogItemName: pick(
              ['Website Development', 'UI/UX Design', 'Maintenance', 'Managed Support'],
              index,
            ),
            description: pick(
              ['Website Development', 'UI/UX Design', 'Maintenance', 'Managed Support'],
              index,
            ),
            quantity: '1',
            unitPrice: `${150_000 + index * 75_000}`,
            amount: `${150_000 + index * 75_000}`,
            position: 0,
          })),
        });
        await tx.payment.createMany({
          data: [0, 1, 2].map((index) => ({
            organizationId,
            companyId: pick(companyIds, index),
            projectId: pick(projectIds, index),
            quotationId: pick(quotationIds, index),
            amount: `${75_000 + index * 50_000}`,
            currency: 'BDT',
            paymentDate: addDays(-index * 4),
            method: 'BANK_TRANSFER' as const,
            reference: `DEMO-PAY-${index + 1}`,
            recordedById: ownerId,
          })),
        });

        const threadIds = Array.from({ length: 3 }, () => randomUUID());
        await tx.emailThread.createMany({
          data: threadIds.map((id, index) => ({
            id,
            organizationId,
            relatedEntityType: index === 0 ? 'CONTACT' : index === 1 ? 'COMPANY' : 'LEAD',
            relatedEntityId: pick(
              [pick(contactIds, 0), pick(companyIds, 1), pick(leadIds, 2)],
              index,
            ),
            assignedUserId: index === 0 ? ownerId : null,
            inboxStatus: ['OPEN', 'WAITING', 'UNASSIGNED'][index] as
              'OPEN' | 'WAITING' | 'UNASSIGNED',
            inboxPriority: index === 0 ? 'HIGH' : 'NORMAL',
            isUnread: index === 2,
            subject: pick(
              [
                'Revised customer portal proposal',
                'Analytics proposal question',
                'CRM migration support',
              ],
              index,
            ),
            lastMessageAt: addDays(-index),
          })),
        });
        await tx.emailMessage.createMany({
          data: threadIds.flatMap((threadId, index) => [
            {
              organizationId,
              threadId,
              direction: 'INBOUND' as const,
              relatedEntityType: index === 0 ? ('CONTACT' as const) : ('COMPANY' as const),
              relatedEntityId: index === 0 ? pick(contactIds, 0) : pick(companyIds, index),
              fromName: pick(contactNames, index).join(' '),
              fromAddress: `customer${index + 1}@example.invalid`,
              toAddresses: ['demo@unicrm.invalid'],
              ccAddresses: [],
              subject: pick(
                [
                  'Revised customer portal proposal',
                  'Analytics proposal question',
                  'CRM migration support',
                ],
                index,
              ),
              body:
                index === 0
                  ? 'Can you send the revised proposal?'
                  : 'Thanks for the update. Could you confirm the next milestone and owner?',
              status: 'SENT' as const,
              receivedAt: addDays(-index),
            },
            {
              organizationId,
              threadId,
              senderUserId: ownerId,
              direction: 'OUTBOUND' as const,
              fromName: 'Demo Admin',
              fromAddress: 'demo@unicrm.invalid',
              toAddresses: [`customer${index + 1}@example.invalid`],
              ccAddresses: [],
              subject: `Re: ${pick(['Revised customer portal proposal', 'Analytics proposal question', 'CRM migration support'], index)}`,
              body: 'Absolutely. I have added the next step to the shared plan.',
              status: 'SENT' as const,
              simulated: true,
              sentAt: addDays(-index),
            },
          ]),
        });

        await tx.customerCase.createMany({
          data: [
            ['DEMO-CASE-001', 'Portal access question', 'OPEN', 'HIGH', 0],
            ['DEMO-CASE-002', 'Dashboard export guidance', 'IN_PROGRESS', 'NORMAL', 1],
            ['DEMO-CASE-003', 'Update billing contact', 'RESOLVED', 'LOW', 2],
          ].map(([caseNumber, title, status, priority, index]) => ({
            organizationId,
            caseNumber: caseNumber as string,
            title: title as string,
            type: 'SERVICE_REQUEST' as const,
            status: status as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED',
            priority: priority as 'HIGH' | 'NORMAL' | 'LOW',
            contactId: pick(contactIds, index as number),
            companyId: pick(companyIds, index as number),
            sourceThreadId: pick(threadIds, index as number),
            assignedUserId: ownerId,
            createdById: ownerId,
            resolvedAt: status === 'RESOLVED' ? addDays(-1) : null,
          })),
        });

        const tags = await Promise.all(
          ['High Value', 'Needs Follow-up', 'Enterprise'].map((name) =>
            tx.tag.create({
              data: { organizationId, name, normalizedName: name.toLowerCase() },
            }),
          ),
        );
        await tx.entityTag.createMany({
          data: [
            {
              organizationId,
              tagId: pick(tags, 0).id,
              entityType: 'LEAD',
              entityId: pick(leadIds, 0),
            },
            {
              organizationId,
              tagId: pick(tags, 1).id,
              entityType: 'LEAD',
              entityId: pick(leadIds, 1),
            },
            {
              organizationId,
              tagId: pick(tags, 2).id,
              entityType: 'COMPANY',
              entityId: pick(companyIds, 0),
            },
          ],
        });
        await tx.customFieldDefinition.createMany({
          data: [
            {
              organizationId,
              entityType: 'LEAD',
              name: 'Budget Type',
              key: 'budget_type',
              fieldType: 'SELECT',
              position: 0,
              options: ['Fixed', 'Flexible'],
            },
            {
              organizationId,
              entityType: 'COMPANY',
              name: 'Customer Tier',
              key: 'customer_tier',
              fieldType: 'SELECT',
              position: 0,
              options: ['Growth', 'Enterprise'],
            },
          ],
        });
        await tx.savedView.createMany({
          data: [
            {
              organizationId,
              userId: ownerId,
              entityType: 'LEAD',
              name: 'My High Value Leads',
              filters: { ownerId, priority: 'HIGH' },
              sort: { field: 'estimatedValue', direction: 'desc' },
              visibility: 'PRIVATE',
            },
            {
              organizationId,
              entityType: 'TASK',
              name: 'Upcoming Delivery Work',
              filters: { status: 'TODO' },
              visibility: 'ORGANIZATION',
            },
          ],
        });
        await tx.automationRule.create({
          data: {
            organizationId,
            name: 'High Value Qualified Lead',
            entityType: 'LEAD',
            triggerType: 'LEAD_STAGE_CHANGED',
            conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH' }],
            actions: [{ type: 'ADD_TAG', tagId: pick(tags, 0).id }],
            active: false,
            createdById: ownerId,
          },
        });
        await tx.notification.createMany({
          data: [
            {
              organizationId,
              userId: ownerId,
              type: 'TASK_DUE_SOON',
              title: 'Task due soon',
              message: 'Prepare solution architecture is due tomorrow.',
              entityType: 'TASK',
              entityId: pick(taskIds, 1),
              dedupeKey: 'demo-task-due',
            },
            {
              organizationId,
              userId: ownerId,
              type: 'ACTIVITY_REMINDER',
              title: 'Upcoming meeting',
              message: 'Apex proposal review starts tomorrow.',
              entityType: 'SCHEDULED_ACTIVITY',
              dedupeKey: 'demo-meeting',
            },
          ],
        });
        await tx.activityLog.create({
          data: {
            organizationId,
            actorId: ownerId,
            entityType: 'ORGANIZATION',
            entityId: organizationId,
            action: 'DEMO_WORKSPACE_SEEDED',
            metadata: { version: 1 },
          },
        });
      },
      { timeout: 30_000 },
    );
  }
}
