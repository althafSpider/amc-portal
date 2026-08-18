import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Push delivery entries are not tied to a reminder, so allow null.
  await db.schema
    .alterTable("notification_history")
    .alterColumn("reminder_id", (col) => col.dropNotNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Only safe to run when no null reminder_id rows exist.
  await db.schema
    .alterTable("notification_history")
    .alterColumn("reminder_id", (col) => col.setNotNull())
    .execute();
}
