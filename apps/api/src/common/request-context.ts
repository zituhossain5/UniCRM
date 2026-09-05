import type { Request } from 'express';

export type RequestWithContext = Request & {
  requestId?: string;
  auth?: {
    organizationId?: string;
    userId?: string;
  };
};

export function requestIdFrom(request: Request): string | undefined {
  return (request as RequestWithContext).requestId;
}
