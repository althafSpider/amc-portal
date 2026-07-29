import { Module } from '@nestjs/common';
import { GlobalNotificationUsersController } from './global-notification-users.controller';
import { GlobalNotificationUsersService } from './global-notification-users.service';
import { DatabaseModule } from '../../db/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [GlobalNotificationUsersController],
  providers: [GlobalNotificationUsersService],
  exports: [GlobalNotificationUsersService],
})
export class GlobalNotificationUsersModule {}
