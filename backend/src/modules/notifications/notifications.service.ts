import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely } from 'kysely';
import { DB } from '../../db/types.generated';
import { Observable, Subject } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { PushService } from '../push/push.service';

export interface NotificationEvent {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
  is_read: boolean;
}

export interface NotificationPayload {
  type: string;
  title: string;
  message?: string;
  link?: string;
  severity?: 'info' | 'warning' | 'critical';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  // Maps userId -> Subject that pushes events to all connected SSE clients for that user
  private readonly userSubjects = new Map<string, Subject<NotificationEvent>>();

  constructor(
    @InjectKysely() private readonly db: Kysely<DB>,
    private readonly pushService: PushService,
  ) {}

  /**
   * Subscribe to SSE notifications for a given user.
   * Returns an Observable that emits NotificationEvent objects.
   */
  subscribeToUser(userId: string): Observable<NotificationEvent> {
    if (!this.userSubjects.has(userId)) {
      this.userSubjects.set(userId, new Subject<NotificationEvent>());
      this.logger.log(`User ${userId} subscribed to notifications`);
    }

    return this.userSubjects.get(userId)!.asObservable();
  }

  /**
   * Remove a user's SSE subscription.
   */
  unsubscribeUser(userId: string) {
    const subject = this.userSubjects.get(userId);
    if (subject) {
      subject.complete();
      this.userSubjects.delete(userId);
      this.logger.log(`User ${userId} unsubscribed from notifications`);
    }
  }

  /**
   * Publish a notification to a specific user.
   * Persists to DB and delivers in-memory to any connected SSE clients for this user.
   * Also dispatches to all global notification recipients automatically.
   *
   * @param skipGlobalDispatch - Set to true when calling from sendToAllUsers to prevent
   *   duplicate notifications (sendToAllUsers already covers global users).
   */
  async sendNotification(userId: string, payload: NotificationPayload, skipGlobalDispatch = false): Promise<NotificationEvent> {
    const event = await this.persistAndDeliver(userId, payload);

    if (!skipGlobalDispatch) {
      // Always notify global recipients (excluding the original recipient to avoid duplicates)
      await this.notifyGlobalRecipients(payload, userId);
    }

    return event;
  }

  /**
   * Core persist + SSE delivery logic shared by both sendNotification and notifyGlobalRecipients.
   */
  private async persistAndDeliver(userId: string, payload: NotificationPayload): Promise<NotificationEvent> {
    const id = uuid();
    const now = new Date();

    try {
      await this.db
        .insertInto('in_app_notifications')
        .values({
          id,
          user_id: userId,
          type: payload.type,
          title: payload.title,
          message: payload.message ?? null,
          link: payload.link ?? null,
          severity: payload.severity ?? 'info',
          is_read: false,
        })
        .execute();
    } catch (err) {
      this.logger.error(`Failed to persist notification for user ${userId}`, err);
    }

    const event: NotificationEvent = {
      id,
      type: payload.type,
      title: payload.title,
      message: payload.message ?? null,
      link: payload.link ?? null,
      severity: (payload.severity ?? 'info') as 'info' | 'warning' | 'critical',
      created_at: now.toISOString(),
      is_read: false,
    };

    // Deliver to any connected SSE client for this user
    const subject = this.userSubjects.get(userId);
    if (subject) {
      subject.next(event);
    }

    // Deliver browser push notification to this user's devices (fire-and-forget)
    this.pushService
      .sendToUser(userId, {
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link,
        severity: payload.severity,
      })
      .catch((err) => {
        this.logger.warn(
          `Failed to send web push to user ${userId}: ${err instanceof Error ? err.message : err}`,
        );
      });

    return event;
  }

  /**
   * Send a notification to all users on the global notification recipients list.
   * Optionally excludes one or more user IDs to avoid duplicate delivery.
   */
  private async notifyGlobalRecipients(payload: NotificationPayload, excludeUserIds?: string | string[]): Promise<void> {
    let query = this.db
      .selectFrom('global_notification_users')
      .innerJoin('users', 'users.id', 'global_notification_users.user_id')
      .select('global_notification_users.user_id')
      .where('users.is_active', '=', true);

    if (excludeUserIds) {
      const ids = Array.isArray(excludeUserIds) ? excludeUserIds : [excludeUserIds];
      if (ids.length === 1) {
        query = query.where('global_notification_users.user_id', '!=', ids[0]);
      } else if (ids.length > 1) {
        query = query.where('global_notification_users.user_id', 'not in', ids);
      }
    }

    const userIds = await query.execute();

    if (userIds.length === 0) return;

    const results = await Promise.allSettled(
      userIds.map((u) => this.persistAndDeliver(u.user_id, payload)),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(`Failed to notify ${failed.length}/${userIds.length} global recipients`);
    }
  }

  /**
   * Send notification to all account managers of a specific client.
   * Global notification recipients are notified once (not once per manager).
   */
  async notifyClientManagers(
    clientId: string,
    payload: NotificationPayload,
  ) {
    const managers = await this.db
      .selectFrom('client_account_managers')
      .innerJoin('users', 'users.id', 'client_account_managers.manager_id')
      .select('users.id')
      .where('client_account_managers.client_id', '=', clientId)
      .where('client_account_managers.deleted_at', 'is', null)
      .where('users.is_active', '=', true)
      .execute();

    const managerIds = managers.map((m) => m.id);

    // Send to managers without per-manager global dispatch to avoid duplicates
    for (const managerId of managerIds) {
      await this.sendNotification(managerId, payload, true);
    }

    // Notify global recipients once, excluding all managers to prevent duplicates
    await this.notifyGlobalRecipients(payload, managerIds);
  }

  /**
   * List notifications for a user with pagination.
   */
  async listNotifications(userId: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    const [{ total }, data] = await Promise.all([
      this.db
        .selectFrom('in_app_notifications')
        .select(this.db.fn.countAll<number>().as('total'))
        .where('user_id', '=', userId)
        .executeTakeFirst()
        .then((r) => ({ total: Number(r?.total ?? 0) })),
      this.db
        .selectFrom('in_app_notifications')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
    ]);

    return {
      data: data.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        severity: n.severity,
        is_read: n.is_read,
        created_at: n.created_at.toISOString(),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get unread notification count for a user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await this.db
      .selectFrom('in_app_notifications')
      .select(this.db.fn.countAll<number>().as('count'))
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Mark a notification as read.
   */
  async markAsRead(notificationId: string, userId: string) {
    await this.db
      .updateTable('in_app_notifications')
      .set({ is_read: true })
      .where('id', '=', notificationId)
      .where('user_id', '=', userId)
      .execute();
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: string) {
    await this.db
      .updateTable('in_app_notifications')
      .set({ is_read: true })
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .execute();
  }
}
