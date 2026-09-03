/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ReportsService } from '../src/reports/reports.service';
import { SearchService } from '../src/search/search.service';
import type { AuthenticatedPrincipal } from '../src/auth/auth.types';
import type { PrismaService } from '../src/database/prisma.service';

const principal = (permissions: string[] = []): AuthenticatedPrincipal => ({
  userId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  sessionId: 'session',
  csrfTokenHash: 'csrf',
  roles: ['Staff'],
  permissions,
});
const prisma = (value: object) => value as unknown as PrismaService;

describe('Milestone 6 operational services', () => {
  it('builds permission-aware dashboard metrics using tenant and responsibility scopes', async () => {
    const leadCount = vi.fn().mockResolvedValue(4);
    const taskCount = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const service = new DashboardService(
      prisma({
        lead: { count: leadCount },
        project: { count: vi.fn() },
        task: { count: taskCount },
        followUp: { count: vi.fn() },
      }),
    );
    const response = await service.summary(principal(['lead.read', 'task.read']));
    expect(response.data.openLeads).toBe(4);
    expect(response.data.overdueTasks).toBe(2);
    expect(response.data.activeProjects).toBeNull();
    expect(leadCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: principal().organizationId,
          ownerId: principal().userId,
        }),
      }),
    );
  });

  it('defines lead conversion as won divided by all closed leads and handles zero', async () => {
    const service = new ReportsService(
      prisma({ $transaction: vi.fn().mockResolvedValue([12, 8]), lead: { count: vi.fn() } }),
    );
    const result = await service.leadConversion(principal(), { page: 1, limit: 25 });
    expect(result.data.conversionPercent).toBe(60);
    expect(result.meta.formula).toContain('Won leads');
    const empty = new ReportsService(
      prisma({ $transaction: vi.fn().mockResolvedValue([0, 0]), lead: { count: vi.fn() } }),
    );
    expect(
      (await empty.leadConversion(principal(), { page: 1, limit: 25 })).data.conversionPercent,
    ).toBeNull();
  });

  it('scopes notification reads to both tenant and current user', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new NotificationsService(prisma({ notification: { findFirst } }));
    await expect(
      service.markRead(principal(), '33333333-3333-4333-8333-333333333333'),
    ).rejects.toThrow('Notification not found');
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: '33333333-3333-4333-8333-333333333333',
        organizationId: principal().organizationId,
        userId: principal().userId,
      },
    });
  });

  it('uses a stable unique key for idempotent notification creation', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'notification' });
    const service = new NotificationsService(prisma({ notification: { upsert } }));
    const input = {
      organizationId: principal().organizationId,
      userId: principal().userId,
      type: 'TASK_OVERDUE' as const,
      title: 'Task overdue',
      message: 'Demo',
      dedupeKey: 'task:1:overdue',
    };
    await service.create(input);
    await service.create(input);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId_dedupeKey: {
            organizationId: input.organizationId,
            userId: input.userId,
            dedupeKey: input.dedupeKey,
          },
        },
        update: {},
      }),
    );
  });

  it('bounds grouped search and omits categories without permission', async () => {
    const companyFind = vi.fn().mockResolvedValue([{ id: 'company', name: 'Nova' }]);
    const quotationFind = vi.fn();
    const service = new SearchService(
      prisma({
        company: { findMany: companyFind },
        contact: { findMany: vi.fn() },
        lead: { findMany: vi.fn() },
        project: { findMany: vi.fn() },
        task: { findMany: vi.fn() },
        quotation: { findMany: quotationFind },
      }),
    );
    const result = await service.search(principal(['company.read']), 'Nova', 5);
    expect(result.data.companies).toHaveLength(1);
    expect(result.data.quotations).toEqual([]);
    expect(companyFind).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        where: expect.objectContaining({ organizationId: principal().organizationId }),
      }),
    );
    expect(quotationFind).not.toHaveBeenCalled();
  });
});
