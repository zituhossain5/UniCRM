import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS, type PermissionKey } from './auth.constants';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!required.every((permission) => principal.permissions.includes(permission))) {
      throw new ForbiddenException('Insufficient permission');
    }
    return true;
  }
}
