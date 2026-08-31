import type { Request } from 'express';

export interface AuthenticatedPrincipal {
  userId: string;
  organizationId: string;
  sessionId: string;
  csrfTokenHash: string;
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  auth: AuthenticatedPrincipal;
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export function requestMetadata(request: Request): RequestMetadata {
  return {
    ipAddress: request.ip,
    userAgent: request.get('user-agent')?.slice(0, 500),
  };
}
