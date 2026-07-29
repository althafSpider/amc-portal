import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  Sse,
  UnauthorizedException,
  ParseIntPipe,
  DefaultValuePipe,
  MessageEvent,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map, finalize } from 'rxjs/operators';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * SSE endpoint: streams real-time notifications to the authenticated user.
   * Uses NestJS's @Sse() decorator which properly manages the Observable lifecycle.
   * The JwtAuthGuard extracts the token from the cookie automatically.
   */
  @Sse('stream')
  stream(@Req() req: Request): Observable<MessageEvent> {
    const user = (req as any).user as AuthenticatedUser;
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.notificationsService.subscribeToUser(user.id).pipe(
      map((event) => ({
        type: 'notification',
        data: JSON.stringify(event),
      }) as MessageEvent),
      finalize(() => {
        this.notificationsService.unsubscribeUser(user.id);
      }),
    );
  }

  /**
   * List notifications for the authenticated user (paginated).
   */
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.listNotifications(user.id, page, limit);
  }


  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.notificationsService.getUnreadCount(user.id);
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.notificationsService.markAsRead(id, user.id);
    return { message: 'Notification marked as read' };
  }

  /**
   * Mark all notifications as read.
   */
  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    await this.notificationsService.markAllAsRead(user.id);
    return { message: 'All notifications marked as read' };
  }

}
