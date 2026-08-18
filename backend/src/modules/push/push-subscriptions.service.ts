import { Injectable } from "@nestjs/common";
import { InjectKysely } from "nestjs-kysely";
import { Kysely, sql } from "kysely";
import { DB } from "../../db/types.generated";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

@Injectable()
export class PushSubscriptionsService {
  constructor(@InjectKysely() private readonly db: Kysely<DB>) {}

  /**
   * Upsert a browser push subscription for a user, keyed by endpoint.
   */
  async save(userId: string, input: PushSubscriptionInput, userAgent?: string): Promise<void> {
    await this.db
      .insertInto("push_subscriptions")
      .values({
        user_id: userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        user_agent: userAgent ?? null,
      })
      .onConflict((oc) =>
        oc.column("endpoint").doUpdateSet({
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          user_agent: userAgent ?? null,
          updated_at: sql`now()`,
        }),
      )
      .execute();
  }

  /**
   * Remove a push subscription for a user by endpoint.
   */
  async removeByEndpoint(userId: string, endpoint: string): Promise<void> {
    await this.db
      .deleteFrom("push_subscriptions")
      .where("user_id", "=", userId)
      .where("endpoint", "=", endpoint)
      .execute();
  }
}
