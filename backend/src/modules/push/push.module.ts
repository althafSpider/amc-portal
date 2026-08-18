import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../db/database.module";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { PushSubscriptionsService } from "./push-subscriptions.service";
import { PushPreferencesService } from "./push-preferences.service";

@Module({
  imports: [DatabaseModule],
  controllers: [PushController],
  providers: [PushService, PushSubscriptionsService, PushPreferencesService],
  exports: [PushService, PushPreferencesService],
})
export class PushModule {}
