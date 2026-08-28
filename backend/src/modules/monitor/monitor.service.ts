import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely, sql } from 'kysely';
import { DB } from '../../db/types.generated';
import axios from 'axios';
import * as net from 'net';
import ping from 'ping';
import {
  CreateMonitorDto,
  UpdateMonitorDto,
  ListMonitorsDto,
  MonitorSortBy,
  SortOrder,
} from './dto';
import { QueueService } from '../../queue/queue.service';

const CONSECUTIVE_FAILURES_TO_INCIDENT = 3;

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<DB>,
    private readonly queueService: QueueService,
  ) {}

  // ── CRUD ──

  async create(dto: CreateMonitorDto, createdBy?: string) {
    const monitor = await this.db
      .insertInto('monitors')
      .values({
        asset_id: dto.asset_id,
        name: dto.name,
        check_type: dto.check_type,
        target: dto.target,
        interval_seconds: dto.interval_seconds ?? 300,
        expected_status_code: dto.expected_status_code ?? null,
        expected_keyword: dto.expected_keyword ?? null,
        enabled: dto.enabled ?? true,
        created_by_id: createdBy ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (monitor.enabled) {
      await this.queueService.scheduleMonitorCheck(monitor.id, monitor.interval_seconds);
    }

    return monitor;
  }

  async list(dto: ListMonitorsDto) {
    const {
      page = 1,
      limit = 50,
      search,
      asset_id,
      check_type,
      current_status,
      sort_by = MonitorSortBy.NAME,
      sort_order = SortOrder.ASC,
    } = dto;
    const offset = (page - 1) * limit;

    let baseQuery = this.db
      .selectFrom('monitors')
      .leftJoin('assets', 'assets.id', 'monitors.asset_id');

    let countQuery = this.db
      .selectFrom('monitors')
      .select(this.db.fn.countAll<number>().as('total'));

    if (search) {
      const pattern = `%${search}%`;
      const filter = (eb: any) => eb.or([
        eb('monitors.name', 'ilike', pattern),
        eb('monitors.target', 'ilike', pattern),
      ]);
      baseQuery = baseQuery.where(filter);
      countQuery = countQuery.where(filter);
    }

    if (asset_id) {
      baseQuery = baseQuery.where('monitors.asset_id', '=', asset_id);
      countQuery = countQuery.where('monitors.asset_id', '=', asset_id);
    }

    if (check_type) {
      baseQuery = baseQuery.where('monitors.check_type', '=', check_type);
      countQuery = countQuery.where('monitors.check_type', '=', check_type);
    }

    if (current_status) {
      baseQuery = baseQuery.where('monitors.current_status', '=', current_status);
      countQuery = countQuery.where('monitors.current_status', '=', current_status);
    }

    const allowedSortColumns: Record<string, string> = {
      [MonitorSortBy.NAME]: 'monitors.name',
      [MonitorSortBy.STATUS]: 'monitors.current_status',
      [MonitorSortBy.TYPE]: 'monitors.check_type',
      [MonitorSortBy.CREATED_AT]: 'monitors.created_at',
      [MonitorSortBy.LAST_CHECKED]: 'monitors.last_checked_at',
    };

    const sortColumn = allowedSortColumns[sort_by] ?? 'monitors.name';
    const order = sort_order === SortOrder.DESC ? sql`desc` : sql`asc`;

    const [{ total }, data] = await Promise.all([
      countQuery.executeTakeFirst().then((r) => ({ total: Number(r?.total ?? 0) })),
      baseQuery
        .select([
          'monitors.id',
          'monitors.name',
          'monitors.check_type',
          'monitors.target',
          'monitors.interval_seconds',
          'monitors.current_status',
          'monitors.enabled',
          'monitors.last_checked_at',
          'monitors.asset_id',
          'monitors.created_at',
          'monitors.updated_at',
          'assets.name as asset_name',
        ])
        .orderBy(sql`${sql.raw(sortColumn)}`, order)
        .limit(limit)
        .offset(offset)
        .execute(),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    const monitor = await this.db
      .selectFrom('monitors')
      .leftJoin('assets', 'assets.id', 'monitors.asset_id')
      .selectAll('monitors')
      .select([
        'assets.name as asset_name',
        'assets.client_id',
      ])
      .where('monitors.id', '=', id)
      .executeTakeFirst();

    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);

    const [recentChecks, accountManagers] = await Promise.all([
      this.db
        .selectFrom('monitor_checks')
        .selectAll()
        .where('monitor_id', '=', id)
        .orderBy('checked_at', 'desc')
        .limit(50)
        .execute(),
      monitor.client_id
        ? this.db
            .selectFrom('client_account_managers')
            .innerJoin('users', 'users.id', 'client_account_managers.manager_id')
            .select([
              'users.id',
              'users.name',
              'users.email',
            ])
            .where('client_account_managers.client_id', '=', monitor.client_id)
            .where('client_account_managers.deleted_at', 'is', null)
            .where('users.is_active', '=', true)
            .execute()
        : Promise.resolve([] as { id: string; name: string; email: string }[]),
    ]);

    const { client_id, ...monitorData } = monitor;
    return { ...monitorData, recent_checks: recentChecks, account_managers: accountManagers };
  }

  async update(id: string, dto: UpdateMonitorDto) {
    const existing = await this.checkExists(id);

    const updateData: Record<string, unknown> = { updated_at: new Date() };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.asset_id !== undefined) updateData.asset_id = dto.asset_id;
    if (dto.check_type !== undefined) updateData.check_type = dto.check_type;
    if (dto.target !== undefined) updateData.target = dto.target;
    if (dto.interval_seconds !== undefined) updateData.interval_seconds = dto.interval_seconds;
    if (dto.expected_status_code !== undefined) updateData.expected_status_code = dto.expected_status_code;
    if (dto.expected_keyword !== undefined) updateData.expected_keyword = dto.expected_keyword;
    if (dto.enabled !== undefined) updateData.enabled = dto.enabled;

    const updated = await this.db
      .updateTable('monitors')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    const wasEnabled = existing.enabled;
    const isEnabled = updated.enabled;
    const intervalChanged = dto.interval_seconds !== undefined && dto.interval_seconds !== existing.interval_seconds;

    if (wasEnabled && (!isEnabled || intervalChanged)) {
      await this.queueService.removeScheduledCheck(id);
    }

    if (isEnabled && (!wasEnabled || intervalChanged)) {
      await this.queueService.scheduleMonitorCheck(id, updated.interval_seconds);
    }

    return updated;
  }

  async remove(id: string) {
    await this.checkExists(id);

    await this.queueService.removeScheduledCheck(id);

    await this.db
      .deleteFrom('monitors')
      .where('id', '=', id)
      .execute();

    await this.db
      .deleteFrom('monitor_checks')
      .where('monitor_id', '=', id)
      .execute();

    return { message: 'Monitor deleted successfully' };
  }

  // ── Bulk Check ──

  triggerCheckAllStream(): Observable<{ type: string; data: any }> {
    const subject = new Subject<{ type: string; data: any }>();

    // Run async work outside the observable chain
    (async () => {
      try {
        const enabledMonitors = await this.db
          .selectFrom('monitors')
          .selectAll()
          .where('enabled', '=', true)
          .execute();

        const total = enabledMonitors.length;

        if (total === 0) {
          subject.next({
            type: 'message',
            data: { event: 'complete', message: 'No enabled monitors found to check', total: 0, triggered: 0, failed: 0 },
          });
          subject.complete();
          return;
        }

        subject.next({ type: 'message', data: { event: 'start', total } });

        let triggered = 0;
        let failed = 0;
        const errors: string[] = [];

        for (let i = 0; i < enabledMonitors.length; i++) {
          const monitor = enabledMonitors[i];
          try {
            await this.executeCheck(monitor);
            triggered++;
          } catch (err: any) {
            failed++
            errors.push(`${monitor.name}: ${err.message}`);
            this.logger.error(`Failed to check monitor ${monitor.id} (${monitor.name}): ${err.message}`);
          }

          subject.next({
            type: 'message',
            data: {
              event: 'progress',
              current: i + 1,
              total,
              monitorName: monitor.name,
              status: failed > 0 && errors[errors.length - 1]?.startsWith(monitor.name) ? 'error' : 'ok',
            },
          });
        }

        subject.next({
          type: 'message',
          data: {
            event: 'complete',
            message: `Refresh complete: ${triggered} of ${total} monitors checked successfully${failed > 0 ? `, ${failed} failed` : ''}`,
            total,
            triggered,
            failed,
            errors: errors.length > 0 ? errors : undefined,
          },
        });
      } catch (err: any) {
        subject.next({ type: 'message', data: { event: 'error', message: err.message } });
      } finally {
        subject.complete();
      }
    })();

    return subject.asObservable();
  }

  async triggerCheckAll() {
    const enabledMonitors = await this.db
      .selectFrom('monitors')
      .selectAll()
      .where('enabled', '=', true)
      .execute();

    if (enabledMonitors.length === 0) {
      return {
        message: 'No enabled monitors found to check',
        total: 0,
        triggered: 0,
        failed: 0,
      };
    }

    let triggered = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const monitor of enabledMonitors) {
      try {
        await this.executeCheck(monitor);
        triggered++;
      } catch (err: any) {
        failed++;
        errors.push(`${monitor.name}: ${err.message}`);
        this.logger.error(`Failed to check monitor ${monitor.id} (${monitor.name}): ${err.message}`);
      }
    }

    return {
      message: `Refresh complete: ${triggered} of ${enabledMonitors.length} monitors checked successfully${failed > 0 ? `, ${failed} failed` : ''}`,
      total: enabledMonitors.length,
      triggered,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ── Check Execution ──

  async triggerCheck(id: string) {
    const monitor = await this.db
      .selectFrom('monitors')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);

    return this.executeCheck(monitor);
  }

  private async executeCheck(monitor: any) {
    const startedAt = Date.now();
    let status: string;
    let statusCode: number | null = null;
    let responseTimeMs: number | null = null;
    let errorMessage: string | null = null;

    try {
      switch (monitor.check_type) {
        case 'http':
        case 'https': {
          const res = await axios.get(monitor.target, {
            timeout: 10000,
            validateStatus: () => true,
            responseType: 'text',
          });
          statusCode = res.status;
          responseTimeMs = Date.now() - startedAt;
          const expectedCode = monitor.expected_status_code ?? 200;
          const passed = res.status === expectedCode;

          if (monitor.expected_keyword) {
            const hasKeyword = res.data?.includes(monitor.expected_keyword);
            if (!hasKeyword) {
              errorMessage = `Expected keyword "${monitor.expected_keyword}" not found in response`;
            }
            status = passed && hasKeyword ? 'up' : 'down';
          } else {
            status = passed ? 'up' : 'down';
          }

          if (status === 'down' && !errorMessage) {
            errorMessage = `HTTP ${res.status} (expected ${expectedCode})`;
          }
          break;
        }

        case 'tcp': {
          const url = new URL(`//${monitor.target}`, 'tcp://');
          const host = url.hostname || monitor.target;
          const port = parseInt(url.port, 10) || 80;

          await new Promise<void>((resolve, reject) => {
            const socket = new net.Socket();
            const timeout = 10000;

            socket.setTimeout(timeout);
            socket.on('connect', () => {
              responseTimeMs = Date.now() - startedAt;
              socket.destroy();
              resolve();
            });
            socket.on('error', (err) => {
              socket.destroy();
              reject(err);
            });
            socket.on('timeout', () => {
              socket.destroy();
              reject(new Error('Connection timed out'));
            });
            socket.connect(port, host);
          });

          status = 'up';
          break;
        }

        case 'ping': {
          const result = await ping.promise.probe(monitor.target, {
            timeout: 10,
            extra: ['-c', '1'],
          });
          responseTimeMs = result.time !== undefined ? Math.round(result.time) : null;
          status = result.alive ? 'up' : 'down';
          if (!result.alive) {
            errorMessage = result.output || 'Host unreachable';
          }
          break;
        }

        case 'keyword': {
          const res = await axios.get(monitor.target, {
            timeout: 10000,
            validateStatus: () => true,
            responseType: 'text',
          });
          statusCode = res.status;
          responseTimeMs = Date.now() - startedAt;

          if (monitor.expected_keyword && !res.data?.includes(monitor.expected_keyword)) {
            status = 'down';
            errorMessage = `Expected keyword "${monitor.expected_keyword}" not found`;
          } else {
            status = res.status < 500 ? 'up' : 'down';
            if (status === 'down') {
              errorMessage = `HTTP ${res.status}`;
            }
          }
          break;
        }

        default:
          status = 'down';
          errorMessage = `Unknown check type: ${monitor.check_type}`;
      }
    } catch (err: any) {
      status = 'down';
      errorMessage = err.message || 'Check failed';
      responseTimeMs = Date.now() - startedAt;
    }

    // Sanitize responseTimeMs — the ping library can return NaN
    const safeResponseTimeMs =
      responseTimeMs !== null && !isNaN(responseTimeMs) ? responseTimeMs : null;

    // Record the check result
    const checkResult = await this.db
      .insertInto('monitor_checks')
      .values({
        monitor_id: monitor.id,
        status_code: statusCode,
        response_time_ms: safeResponseTimeMs,
        error_message: errorMessage,
        status,
        checked_at: new Date(),
      })
      .returningAll()
      .executeTakeFirst();

    // Update monitor status
    await this.db
      .updateTable('monitors')
      .set({
        current_status: status,
        last_checked_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', monitor.id)
      .execute();

    // Incident auto-creation on consecutive failures
    if (status === 'down') {
      await this.handleConsecutiveFailure(monitor.id);
    }

    // Auto-resolve incidents on consecutive successes
    if (status === 'up') {
      await this.handleConsecutiveSuccess(monitor.id);
    }

    return checkResult;
  }

  private async handleConsecutiveFailure(monitorId: string) {
    // Check if there's already an unresolved incident for this monitor
    const existingIncident = await this.db
      .selectFrom('incidents')
      .select('id')
      .where('monitor_id', '=', monitorId)
      .where('resolved_at', 'is', null)
      .executeTakeFirst();

    if (existingIncident) return;

    // Check that the last N checks are ALL 'down' consecutively.
    // Find the most recent 'up' check; if none exists, count ALL checks since the beginning.
    const mostRecentUp = await this.db
      .selectFrom('monitor_checks')
      .select('checked_at')
      .where('monitor_id', '=', monitorId)
      .where('status', '=', 'up')
      .orderBy('checked_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    const consecutiveDownsQuery = this.db
      .selectFrom('monitor_checks')
      .select(this.db.fn.countAll<number>().as('count'))
      .where('monitor_id', '=', monitorId)
      .where('status', '=', 'down');

    if (mostRecentUp) {
      consecutiveDownsQuery.where('checked_at', '>', mostRecentUp.checked_at);
    }

    const { count: consecutiveDowns } = await consecutiveDownsQuery
      .executeTakeFirst()
      .then((r) => ({ count: Number(r?.count ?? 0) }));

    if (consecutiveDowns < CONSECUTIVE_FAILURES_TO_INCIDENT) return;

    // Determine severity based on check type
    const monitor = await this.db
      .selectFrom('monitors')
      .select('check_type')
      .where('id', '=', monitorId)
      .executeTakeFirst();

    let severity = 'major';
    if (monitor?.check_type === 'http' || monitor?.check_type === 'https') {
      severity = 'critical';
    } else if (monitor?.check_type === 'keyword') {
      severity = 'minor';
    }

    const incident = await this.db
      .insertInto('incidents')
      .values({
        monitor_id: monitorId,
        started_at: new Date(),
        severity,
        notes: `Auto-created after ${CONSECUTIVE_FAILURES_TO_INCIDENT} consecutive failed checks`,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    this.logger.log(
      `Incident auto-created for monitor ${monitorId} after ${CONSECUTIVE_FAILURES_TO_INCIDENT} consecutive failures`,
    );

    // Enqueue immediate notification
    this.queueService.addIncidentNotification(incident.id);
  }

  /**
   * Auto-resolve an open incident when CONSECUTIVE_FAILURES_TO_INCIDENT
   * consecutive checks return 'up'.
   */
  private async handleConsecutiveSuccess(monitorId: string) {
    // Check if there's an unresolved incident for this monitor
    const openIncident = await this.db
      .selectFrom('incidents')
      .select(['id', 'started_at'])
      .where('monitor_id', '=', monitorId)
      .where('resolved_at', 'is', null)
      .executeTakeFirst();

    if (!openIncident) return;

    // Find the most recent 'down' check for this monitor
    const mostRecentDown = await this.db
      .selectFrom('monitor_checks')
      .select('checked_at')
      .where('monitor_id', '=', monitorId)
      .where('status', '=', 'down')
      .orderBy('checked_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    // Count how many consecutive 'up' checks since the last 'down' (or since the beginning)
    const consecutiveUpsQuery = this.db
      .selectFrom('monitor_checks')
      .select(this.db.fn.countAll<number>().as('count'))
      .where('monitor_id', '=', monitorId)
      .where('status', '=', 'up');

    if (mostRecentDown) {
      consecutiveUpsQuery.where('checked_at', '>', mostRecentDown.checked_at);
    }

    const { count: consecutiveUps } = await consecutiveUpsQuery
      .executeTakeFirst()
      .then((r) => ({ count: Number(r?.count ?? 0) }));

    if (consecutiveUps < CONSECUTIVE_FAILURES_TO_INCIDENT) return;

    // Resolve the incident
    const resolvedAt = new Date();
    const durationSeconds = Math.round(
      (resolvedAt.getTime() - new Date(openIncident.started_at).getTime()) / 1000,
    );

    await this.db
      .updateTable('incidents')
      .set({
        resolved_at: resolvedAt,
        duration_seconds: durationSeconds,
      })
      .where('id', '=', openIncident.id)
      .execute();

    this.logger.log(
      `Incident ${openIncident.id} auto-resolved after ${CONSECUTIVE_FAILURES_TO_INCIDENT} consecutive successful checks (duration: ${durationSeconds}s)`,
    );
  }

  // ── Check History ──

  async getCheckHistory(monitorId: string, page = 1, limit = 50) {
    await this.checkExists(monitorId);

    const offset = (page - 1) * limit;

    const [{ total }, data] = await Promise.all([
      this.db
        .selectFrom('monitor_checks')
        .select(this.db.fn.countAll<number>().as('total'))
        .where('monitor_id', '=', monitorId)
        .executeTakeFirst()
        .then((r) => ({ total: Number(r?.total ?? 0) })),
      this.db
        .selectFrom('monitor_checks')
        .selectAll()
        .where('monitor_id', '=', monitorId)
        .orderBy('checked_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Helpers ──

  private async checkExists(id: string) {
    const monitor = await this.db
      .selectFrom('monitors')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);
    return monitor;
  }
}
