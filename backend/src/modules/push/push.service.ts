import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectKysely } from "nestjs-kysely";
import { Kysely } from "kysely";
import webpush from "web-push";
import { DB } from "../../db/types.generated";
import { PushPreferencesService } from "./push-preferences.service";

export interface PushPayload {
  type?: string;
  title: string;
  message?: string | null;
  link?: string | null;
  severity?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly configured: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectKysely() private readonly db: Kysely<DB>,
    private readonly preferencesService: PushPreferencesService,
  ) {
    const publicKey = this.configService.get<string>("VAPID_PUBLIC_KEY",'BNu6ZBBXNTsk-FqIO1jxaPefVqVMnOuLyEUq3nv9nqAAZ-vwmeASQXsE_RuVuIUeAABGvOQvMcYaZY6n2fvzVuo');
    const privateKey = this.configService.get<string>("VAPID_PRIVATE_KEY",'gc-sOQIBYxR3LbRgGwwvGN83RMBv3erXHfAsJxrBILk');

    if (publicKey && privateKey) {
      // The subject is the contact the browser push service associates with
      // this site. Prefer an explicit VAPID_SUBJECT, otherwise use the app's
      // public URL (CORS_ORIGIN), which is the recommended format.
      const subject =
        this.configService.get<string>("VAPID_SUBJECT") ??
        this.configService.get<string>("CORS_ORIGIN", "http://localhost:3000") ??
        "mailto:admin@localhost";

      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        this.configured = true;
        this.logger.log(`Web push configured with subject: ${subject}`);
      } catch {
        // Invalid subject (not a URL or mailto:) — fall back to a plain contact
        webpush.setVapidDetails("mailto:admin@localhost", publicKey, privateKey);
        this.configured = true;
        this.logger.warn(
          `Invalid VAPID subject "${subject}" — using mailto:admin@localhost`,
        );
      }
    } else {
      this.configured = false;
      this.logger.warn(
        "Web push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (generate with `npx web-push generate-vapid-keys --json`) to enable browser push notifications.",
      );
    }
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  getVapidPublicKey(): string | null {
    return (
      this.configService.get<string>(
        "VAPID_PUBLIC_KEY",
        "BNu6ZBBXNTsk-FqIO1jxaPefVqVMnOuLyEUq3nv9nqAAZ-vwmeASQXsE_RuVuIUeAABGvOQvMcYaZY6n2fvzVuo",
      ) ?? null
    );
  }


  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.configured) return;

    // Respect the user's per-type push preferences (default: all types enabled)
    if (payload.type) {
      const shouldSend = await this.preferencesService.shouldSendPush(
        userId,
        payload.type,
      );
      if (!shouldSend) return;
    }

    const subscriptions = await this.db
      .selectFrom("push_subscriptions")
      .selectAll()
      .where("user_id", "=", userId)
      .execute();

    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subscriptions.map((sub) => this.send(sub.id, sub.endpoint, sub.p256dh, sub.auth, body)),
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      this.logger.warn(
        `Push delivery: ${failed.length}/${subscriptions.length} subscriptions failed for user ${userId}`,
      );
    }
  }

  /**
   * Send a test push notification to the user's devices to verify delivery.
   * Skips per-type preferences and history logging — this is a diagnostic tool.
   */
  async sendTest(userId: string): Promise<{ sent: number; failed: number; configured: boolean }> {
    if (!this.configured) return { sent: 0, failed: 0, configured: false };

    const subscriptions = await this.db
      .selectFrom("push_subscriptions")
      .selectAll()
      .where("user_id", "=", userId)
      .execute();

    if (subscriptions.length === 0) return { sent: 0, failed: 0, configured: true };

    const body = JSON.stringify({
      type: "test",
      title: "Test notification",
      message: "Your browser push notifications are working!",
      link: "/notifications",
      severity: "info",
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        this.send(sub.id, sub.endpoint, sub.p256dh, sub.auth, body, false),
      ),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    return {
      sent: subscriptions.length - failed,
      failed,
      configured: true,
    };
  }

  private async send(
    subscriptionId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
    body: string,
    logToHistory = true,
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        {
          endpoint,
          keys: { p256dh, auth },
        },
        body,
      );
      if (logToHistory) await this.logHistory(endpoint, true);
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      const message = err instanceof Error ? err.message : "Unknown error";

      if (statusCode === 404 || statusCode === 410) {
        // Subscription is no longer valid (browser unsubscribed or push service purged it)
        await this.db
          .deleteFrom("push_subscriptions")
          .where("id", "=", subscriptionId)
          .execute();
        this.logger.log(`Removed stale push subscription ${subscriptionId}`);
        if (logToHistory) {
          await this.logHistory(endpoint, false, "Subscription no longer valid (404/410)");
        }
      } else {
        if (logToHistory) await this.logHistory(endpoint, false, message);
        throw err;
      }
    }
  }

  /**
   * Record a push delivery attempt in the notification_history table.
   * Push entries are not tied to a reminder, so reminder_id is null.
   */
  private async logHistory(
    endpoint: string,
    success: boolean,
    failureReason?: string | null,
  ): Promise<void> {
    try {
      await this.db
        .insertInto("notification_history")
        .values({
          reminder_id: null,
          recipient: endpoint.slice(0, 255),
          channel: "push",
          status: success ? "sent" : "failed",
          provider_message_id: null,
          failure_reason: success ? null : (failureReason ?? "Unknown error").slice(0, 500),
          sent_at: new Date(),
          delivered_at: success ? new Date() : null,
          failed_at: success ? null : new Date(),
        })
        .execute();
    } catch (err) {
      this.logger.error(
        `Failed to log push notification history: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
