import { Injectable, Logger } from "@nestjs/common";
import { InjectKysely } from "nestjs-kysely";
import { Kysely } from "kysely";
import { DB } from "../../db/types.generated";

@Injectable()
export class PushPreferencesService {
  private readonly logger = new Logger(PushPreferencesService.name);

  constructor(@InjectKysely() private readonly db: Kysely<DB>) {}

  /**
   * Notification types the user wants browser push for.
   * Returns null when no preferences are saved, meaning ALL types are enabled.
   */
  async getPushTypes(userId: string): Promise<string[] | null> {
    const user = await this.db
      .selectFrom("users")
      .select("notification_prefs")
      .where("id", "=", userId)
      .executeTakeFirst();

    const prefs = user?.notification_prefs as
      | { push_types?: unknown }
      | null
      | undefined;

    if (!prefs || !Array.isArray(prefs.push_types)) return null;

    return prefs.push_types.filter((t): t is string => typeof t === "string");
  }

  async savePushTypes(userId: string, pushTypes: string[]): Promise<string[]> {
    const user = await this.db
      .selectFrom("users")
      .select("notification_prefs")
      .where("id", "=", userId)
      .executeTakeFirst();

    const existing =
      (user?.notification_prefs as Record<string, unknown> | null) ?? {};
    const prefs = { ...existing, push_types: pushTypes };

    await this.db
      .updateTable("users")
      .set({ notification_prefs: prefs as never })
      .where("id", "=", userId)
      .execute();

    this.logger.log(`Push preferences updated for user ${userId}: ${pushTypes.join(", ")}`);

    return pushTypes;
  }

  /**
   * Whether a notification of the given type should be delivered as browser
   * push for this user. Defaults to true when the user hasn't saved preferences.
   */
  async shouldSendPush(userId: string, type: string): Promise<boolean> {
    const pushTypes = await this.getPushTypes(userId);
    if (pushTypes === null) return true;
    return pushTypes.includes(type);
  }
}
