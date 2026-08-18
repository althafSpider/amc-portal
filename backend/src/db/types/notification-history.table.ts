import { UUID, Timestamp } from "./common.types";

export interface NotificationHistory {
  id: UUID;

  reminder_id: string | null;

  recipient: string;

  channel: string;

  status: string;

  provider_message_id: string | null;

  failure_reason: string | null;

  sent_at: Timestamp;

  delivered_at: Timestamp | null;

  failed_at: Timestamp | null;
}