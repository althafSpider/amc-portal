import { Body, Controller, Delete, Get, Headers, Post, Put } from "@nestjs/common";
import { PushService } from "./push.service";
import { PushSubscriptionsService } from "./push-subscriptions.service";
import { PushPreferencesService } from "./push-preferences.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import {
  RemovePushSubscriptionDto,
  SavePushSubscriptionDto,
  UpdatePushPreferencesDto,
} from "./dto";

interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

@Controller("push")
export class PushController {
  constructor(
    private readonly pushService: PushService,
    private readonly pushSubscriptionsService: PushSubscriptionsService,
    private readonly pushPreferencesService: PushPreferencesService,
  ) {}

  /**
   * Public VAPID public key used by the browser to create a push subscription.
   */
  @Public()
  @Get("vapid-public-key")
  getVapidPublicKey() {
    return { publicKey: this.pushService.getVapidPublicKey() };
  }

  /**
   * Register (or refresh) the authenticated user's browser push subscription.
   */
  @Post("subscriptions")
  async saveSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SavePushSubscriptionDto,
    @Headers("user-agent") userAgent?: string,
  ) {
    await this.pushSubscriptionsService.save(user.id, dto, userAgent);
    return { message: "Push subscription saved" };
  }

  /**
   * Remove the authenticated user's browser push subscription.
   */
  @Delete("subscriptions")
  async removeSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RemovePushSubscriptionDto,
  ) {
    await this.pushSubscriptionsService.removeByEndpoint(user.id, dto.endpoint);
    return { message: "Push subscription removed" };
  }

  /**
   * Get the authenticated user's browser push type preferences.
   * Returns null for pushTypes when the user hasn't saved preferences (all enabled).
   */
  @Get("preferences")
  async getPreferences(@CurrentUser() user: AuthenticatedUser) {
    const pushTypes = await this.pushPreferencesService.getPushTypes(user.id);
    return { pushTypes };
  }

  /**
   * Save the authenticated user's browser push type preferences.
   */
  @Put("preferences")
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePushPreferencesDto,
  ) {
    const pushTypes = await this.pushPreferencesService.savePushTypes(
      user.id,
      dto.pushTypes,
    );
    return { pushTypes };
  }

  /**
   * Send a test push notification to the authenticated user's devices.
   */
  @Post("test")
  async sendTest(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.pushService.sendTest(user.id);

    if (!result.configured) {
      return {
        success: false,
        message:
          "Web push is not configured — add VAPID keys to the backend environment.",
      };
    }

    if (result.sent === 0 && result.failed === 0) {
      return {
        success: false,
        message: "No push subscription found — enable push notifications on this browser first.",
      };
    }

    if (result.failed > 0) {
      return {
        success: false,
        message: `Test push delivered to ${result.sent} device(s), but ${result.failed} failed.`,
      };
    }

    return {
      success: true,
      message: `Test push sent to ${result.sent} device(s). Check your browser.`,
    };
  }
}
