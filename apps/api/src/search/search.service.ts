import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SearchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(principal: AuthenticatedPrincipal, query: string, limit: number) {
    query = query.trim();
    if (query.length < 2)
      throw new BadRequestException('Search query must be at least 2 characters');
    const organizationId = principal.organizationId;
    const parsedLimit = Number(limit);
    const boundedLimit = Number.isFinite(parsedLimit) ? Math.min(10, Math.max(1, parsedLimit)) : 5;
    const can = (permission: string) => principal.permissions.includes(permission);
    const contains = { contains: query, mode: 'insensitive' as const };
    const [companies, contacts, leads, projects, tasks, quotations] = await Promise.all([
      can(PERMISSIONS.companyRead)
        ? this.prisma.company.findMany({
            where: {
              organizationId,
              archivedAt: null,
              OR: [
                { name: contains },
                { email: contains },
                { phone: contains },
                { website: contains },
              ],
            },
            select: { id: true, name: true, email: true, phone: true },
            orderBy: { name: 'asc' },
            take: boundedLimit,
          })
        : [],
      can(PERMISSIONS.contactRead)
        ? this.prisma.contact.findMany({
            where: {
              organizationId,
              archivedAt: null,
              OR: [
                { firstName: contains },
                { lastName: contains },
                { email: contains },
                { phone: contains },
              ],
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              company: { select: { name: true } },
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            take: boundedLimit,
          })
        : [],
      can(PERMISSIONS.leadRead)
        ? this.prisma.lead.findMany({
            where: {
              organizationId,
              archivedAt: null,
              OR: [
                { title: contains },
                { firstName: contains },
                { lastName: contains },
                { email: contains },
                { phone: contains },
              ],
            },
            select: {
              id: true,
              title: true,
              company: { select: { name: true } },
              stage: { select: { name: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: boundedLimit,
          })
        : [],
      can(PERMISSIONS.projectRead)
        ? this.prisma.project.findMany({
            where: {
              organizationId,
              archivedAt: null,
              OR: [{ name: contains }, { company: { name: contains } }],
            },
            select: { id: true, name: true, status: true, company: { select: { name: true } } },
            orderBy: { updatedAt: 'desc' },
            take: boundedLimit,
          })
        : [],
      can(PERMISSIONS.taskRead)
        ? this.prisma.task.findMany({
            where: {
              organizationId,
              archivedAt: null,
              OR: [{ title: contains }, { project: { name: contains } }],
            },
            select: {
              id: true,
              title: true,
              status: true,
              project: { select: { id: true, name: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: boundedLimit,
          })
        : [],
      can(PERMISSIONS.quotationRead)
        ? this.prisma.quotation.findMany({
            where: {
              organizationId,
              archivedAt: null,
              OR: [{ quotationNumber: contains }, { company: { name: contains } }],
            },
            select: {
              id: true,
              quotationNumber: true,
              status: true,
              company: { select: { name: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: boundedLimit,
          })
        : [],
    ]);
    return {
      data: { companies, contacts, leads, projects, tasks, quotations },
      meta: { query, limit: boundedLimit },
    };
  }
}
