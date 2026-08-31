import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { PUBLIC_ROUTE, REQUIRED_PERMISSIONS, type PermissionKey } from './auth.constants';
import type { AuthenticatedRequest } from './auth.types';

export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
