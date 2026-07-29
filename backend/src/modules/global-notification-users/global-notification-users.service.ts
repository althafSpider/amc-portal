import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely } from 'kysely';
import { DB } from '../../db/types.generated';

@Injectable()
export class GlobalNotificationUsersService {
  private readonly logger = new Logger(GlobalNotificationUsersService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<DB>,
  ) {}

  /**
   * List all global notification users with their user details.
   */
  async list() {
    const rows = await this.db
      .selectFrom('global_notification_users')
      .innerJoin('users', 'users.id', 'global_notification_users.user_id')
      .select([
        'global_notification_users.user_id',
        'global_notification_users.created_at',
        'global_notification_users.created_by',
        'users.name',
        'users.email',
        'users.role',
        'users.is_active',
      ])
      .orderBy('users.name', 'asc')
      .execute();

    return rows.map((row) => ({
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      is_active: row.is_active,
      created_at: row.created_at.toISOString(),
    }));
  }

  /**
   * Get all global notification user IDs (for internal dispatch).
   */
  async listUserIds(): Promise<string[]> {
    const rows = await this.db
      .selectFrom('global_notification_users')
      .innerJoin('users', 'users.id', 'global_notification_users.user_id')
      .select('global_notification_users.user_id')
      .where('users.is_active', '=', true)
      .execute();

    return rows.map((r) => r.user_id);
  }

  /**
   * Add a user to the global notification recipients list.
   */
  async add(userId: string, createdBy: string) {
    // Verify the user exists
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'name', 'is_active'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.is_active) {
      throw new ConflictException('Cannot add an inactive user');
    }

    // Check if already added
    const existing = await this.db
      .selectFrom('global_notification_users')
      .select('user_id')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException('User is already a global notification recipient');
    }

    await this.db
      .insertInto('global_notification_users')
      .values({
        user_id: userId,
        created_by: createdBy,
      })
      .execute();

    this.logger.log(`User ${user.name} (${userId}) added to global notification recipients`);
    return { message: 'User added to global notification recipients' };
  }

  /**
   * Remove a user from the global notification recipients list.
   */
  async remove(userId: string) {
    const existing = await this.db
      .selectFrom('global_notification_users')
      .select('user_id')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundException('User is not a global notification recipient');
    }

    await this.db
      .deleteFrom('global_notification_users')
      .where('user_id', '=', userId)
      .execute();

    this.logger.log(`User ${userId} removed from global notification recipients`);
    return { message: 'User removed from global notification recipients' };
  }
}
