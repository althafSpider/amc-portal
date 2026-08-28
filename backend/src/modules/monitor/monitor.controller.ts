import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MonitorService } from './monitor.service';
import {
  CreateMonitorDto,
  UpdateMonitorDto,
  ListMonitorsDto,
} from './dto';

@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Monitor created successfully')
  @AuditLog({ entityType: 'monitor' })
  async create(
    @Body() dto: CreateMonitorDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.monitorService.create(dto, user.id);
  }

  @Get('list')
  @HttpCode(HttpStatus.OK)
  async list(@Query() dto: ListMonitorsDto) {
    return this.monitorService.list(dto);
  }

  @Sse('check-all-stream')
  triggerCheckAllStream(): Observable<{ type: string; data: any }> {
    return this.monitorService.triggerCheckAllStream();
  }

  @Post('check-all')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('All monitors check completed')
  async triggerCheckAll() {
    return this.monitorService.triggerCheckAll();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.monitorService.getById(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Monitor updated successfully')
  @AuditLog({ entityType: 'monitor' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMonitorDto,
  ) {
    return this.monitorService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Monitor deleted successfully')
  @AuditLog({ entityType: 'monitor' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.monitorService.remove(id);
  }

  @Post(':id/check')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Monitor check completed')
  async triggerCheck(@Param('id', ParseUUIDPipe) id: string) {
    return this.monitorService.triggerCheck(id);
  }

  @Get(':id/checks')
  @HttpCode(HttpStatus.OK)
  async listChecks(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.monitorService.getCheckHistory(id, page ?? 1, limit ?? 50);
  }
}
