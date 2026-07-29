import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { GlobalNotificationUsersService } from './global-notification-users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

@Controller('global-notification-users')
export class GlobalNotificationUsersController {
  constructor(
    private readonly globalNotificationUsersService: GlobalNotificationUsersService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    return this.globalNotificationUsersService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { user_id: string },
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can manage global notification recipients');
    }
    return this.globalNotificationUsersService.add(body.user_id, user.id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can manage global notification recipients');
    }
    return this.globalNotificationUsersService.remove(userId);
  }
}
