import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { NotificationListQueryDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@RequirePermission(PERMISSIONS.notificationsRead)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}
  @Get() list(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: NotificationListQueryDto) {
    return this.notifications.list(p, q);
  }
  @Get('unread-count') async unread(@CurrentPrincipal() p: AuthenticatedPrincipal) {
    return { data: { count: await this.notifications.unreadCount(p) } };
  }
  @Patch(':id/read') async read(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.notifications.markRead(p, id) };
  }
  @Post('read-all') @HttpCode(200) async readAll(@CurrentPrincipal() p: AuthenticatedPrincipal) {
    return { data: { updated: await this.notifications.markAllRead(p) } };
  }
}
