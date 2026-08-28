import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely, sql } from 'kysely';
import { DB } from '../../db/types.generated';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { ListIncidentsDto, IncidentSortBy, SortOrder } from './dto/list-incidents.dto';
import { QueueService } from '../../queue/queue.service';

@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<DB>,
    private readonly queueService: QueueService,
  ) {}

  async create(dto: CreateIncidentDto, createdBy?: string) {
    const incident = await this.db
      .insertInto('incidents')
      .values({
        monitor_id: dto.monitor_id ?? null,
        severity: dto.severity,
        cause: dto.cause ?? null,
        notes: dto.notes ?? null,
        started_at: new Date(),
        created_by_id: createdBy ?? null,
        target_type: dto.target_type ?? null,
        target_id: dto.target_id ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    this.logger.log(`Incident ${incident.id} created (severity: ${dto.severity})`);
    return incident;
  }

  async list(dto: ListIncidentsDto) {
    const {
      page = 1,
      limit = 50,
      monitor_id,
      severity,
      status,
      sort_by = IncidentSortBy.STARTED_AT,
      sort_order = SortOrder.DESC,
    } = dto;
    const offset = (page - 1) * limit;

    let baseQuery = this.db
      .selectFrom('incidents')
      .leftJoin('monitors', 'monitors.id', 'incidents.monitor_id')
      .leftJoin('assets', 'assets.id', 'monitors.asset_id')
      .leftJoin('users', 'users.id', 'incidents.acknowledged_by')
      .leftJoin('domains', 'domains.id', 'incidents.target_id')
      .leftJoin('ssl_certificates', 'ssl_certificates.id', 'incidents.target_id');

    let countQuery = this.db
      .selectFrom('incidents')
      .select(this.db.fn.countAll<number>().as('total'));

    if (monitor_id) {
      baseQuery = baseQuery.where('incidents.monitor_id', '=', monitor_id);
      countQuery = countQuery.where('incidents.monitor_id', '=', monitor_id);
    }

    if (severity) {
      baseQuery = baseQuery.where('incidents.severity', '=', severity);
      countQuery = countQuery.where('incidents.severity', '=', severity);
    }

    if (status === 'open') {
      baseQuery = baseQuery.where('incidents.resolved_at', 'is', null);
      countQuery = countQuery.where('incidents.resolved_at', 'is', null);
    } else if (status === 'resolved') {
      baseQuery = baseQuery.where('incidents.resolved_at', 'is not', null);
      countQuery = countQuery.where('incidents.resolved_at', 'is not', null);
    }

    const allowedSortColumns: Record<string, string> = {
      [IncidentSortBy.SEVERITY]: 'incidents.severity',
      [IncidentSortBy.STARTED_AT]: 'incidents.started_at',
      [IncidentSortBy.RESOLVED_AT]: 'incidents.resolved_at',
      [IncidentSortBy.CREATED_AT]: 'incidents.created_at',
    };

    const sortColumn = allowedSortColumns[sort_by] ?? 'incidents.started_at';
    const order = sort_order === SortOrder.DESC ? sql`desc` : sql`asc`;

    const [{ total }, data] = await Promise.all([
      countQuery.executeTakeFirst().then((r) => ({ total: Number(r?.total ?? 0) })),
      baseQuery
        .select([
          'incidents.id',
          'incidents.monitor_id',
          'incidents.severity',
          'incidents.cause',
          'incidents.notes',
          'incidents.started_at',
          'incidents.resolved_at',
          'incidents.duration_seconds',
          'incidents.acknowledged_by',
          'incidents.created_at',
          'incidents.target_type',
          'incidents.target_id',
          'users.name as acknowledged_by_name',
          'monitors.name as monitor_name',
          'monitors.target as monitor_target',
          'monitors.check_type as monitor_check_type',
          'monitors.current_status as monitor_current_status',
          'assets.name as asset_name',
          'assets.id as asset_id',
          'domains.fqdn as domain_fqdn',
          'ssl_certificates.common_name as ssl_name',
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
    const incident = await this.db
      .selectFrom('incidents')
      .leftJoin('monitors', 'monitors.id', 'incidents.monitor_id')
      .leftJoin('assets', 'assets.id', 'monitors.asset_id')
      .leftJoin('users', 'users.id', 'incidents.acknowledged_by')
      .leftJoin('domains', 'domains.id', 'incidents.target_id')
      .leftJoin('ssl_certificates', 'ssl_certificates.id', 'incidents.target_id')
      .select([
        'incidents.id',
        'incidents.monitor_id',
        'incidents.severity',
        'incidents.cause',
        'incidents.notes',
        'incidents.started_at',
        'incidents.resolved_at',
        'incidents.duration_seconds',
        'incidents.acknowledged_by',
        'incidents.created_at',
        'incidents.target_type',
        'incidents.target_id',
        'users.name as acknowledged_by_name',
        'monitors.name as monitor_name',
        'monitors.target as monitor_target',
        'monitors.check_type as monitor_check_type',
        'monitors.current_status as monitor_current_status',
        'assets.name as asset_name',
        'assets.id as asset_id',
        'domains.fqdn as domain_fqdn',
        'ssl_certificates.common_name as ssl_name',
      ])
      .where('incidents.id', '=', id)
      .executeTakeFirst();

    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    return incident;
  }

  async resolve(id: string) {
    const incident = await this.checkExists(id);

    if (incident.resolved_at) {
      return incident;
    }

    const resolvedAt = new Date();
    const durationSeconds = Math.round(
      (resolvedAt.getTime() - new Date(incident.started_at).getTime()) / 1000,
    );

    const updated = await this.db
      .updateTable('incidents')
      .set({
        resolved_at: resolvedAt,
        duration_seconds: durationSeconds,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    this.logger.log(`Incident ${id} resolved (duration: ${durationSeconds}s)`);
    return updated;
  }

  async acknowledge(id: string, userId: string | null) {
    const incident = await this.checkExists(id);

    if (incident.acknowledged_by) {
      return incident;
    }

    const updated = await this.db
      .updateTable('incidents')
      .set({
        acknowledged_by: userId,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    this.logger.log(`Incident ${id} acknowledged by user ${userId}`);
    return updated;
  }

  async update(id: string, dto: UpdateIncidentDto) {
    await this.checkExists(id);

    const updateData: Record<string, unknown> = {};

    if (dto.severity !== undefined) updateData.severity = dto.severity;
    if (dto.cause !== undefined) updateData.cause = dto.cause;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    return this.db
      .updateTable('incidents')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async remove(id: string) {
    await this.checkExists(id);

    await this.db
      .deleteFrom('incidents')
      .where('id', '=', id)
      .execute();

    return { message: 'Incident deleted successfully' };
  }

  async bulkRemove(ids: string[]) {
    if (ids.length === 0) {
      return { message: 'No incidents selected', deleted: 0 };
    }

    await this.db
      .deleteFrom('incidents')
      .where('id', 'in', ids)
      .execute();

    this.logger.log(`Bulk deleted ${ids.length} incident(s)`);
    return { message: `${ids.length} incident(s) deleted successfully`, deleted: ids.length };
  }

  // ── Expiry-to-Incident Cron Jobs ──

  @Cron('0 */6 * * *') // Every 6 hours
  async checkExpiredDomains() {
    this.logger.log('Checking for expired domains to create incidents...');
    const now = new Date();

    const expiredDomains = await this.db
      .selectFrom('domains')
      .innerJoin('assets', 'assets.id', 'domains.asset_id')
      .select([
        'domains.id',
        'domains.fqdn',
        'domains.expiry_date',
        'assets.name as asset_name',
      ])
      .where('domains.expiry_date', 'is not', null)
      .where('domains.expiry_date', '<', now)
      .execute();

    let created = 0;
    for (const domain of expiredDomains) {
      // Check if an open incident already exists for this domain
      const existing = await this.db
        .selectFrom('incidents')
        .select('id')
        .where('target_type', '=', 'domain')
        .where('target_id', '=', domain.id)
        .where('resolved_at', 'is', null)
        .executeTakeFirst();

      if (existing) continue;

      const incident = await this.db
        .insertInto('incidents')
        .values({
          monitor_id: null,
          severity: 'major',
          cause: 'Domain Expired',
          notes: `Domain ${domain.fqdn} (${domain.asset_name}) expired on ${domain.expiry_date?.toISOString().split('T')[0] ?? 'unknown date'}.`,
          started_at: new Date(),
          target_type: 'domain',
          target_id: domain.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      created++;

      // Enqueue immediate notification
      this.queueService.addIncidentNotification(incident.id);
    }

    this.logger.log(`Expired domain check complete: ${created} incident(s) created`);
    return created;
  }

  @Cron('0 */6 * * *') // Every 6 hours
  async checkExpiredSsl() {
    this.logger.log('Checking for expired SSL certificates to create incidents...');
    const now = new Date();

    const expiredCerts = await this.db
      .selectFrom('ssl_certificates')
      .innerJoin('domains', 'domains.id', 'ssl_certificates.domain_id')
      .leftJoin('assets', 'assets.id', 'ssl_certificates.asset_id')
      .select([
        'ssl_certificates.id',
        'ssl_certificates.common_name',
        'ssl_certificates.valid_to',
        'domains.fqdn as domain_fqdn',
        'assets.name as asset_name',
      ])
      .where('ssl_certificates.valid_to', 'is not', null)
      .where('ssl_certificates.valid_to', '<', now)
      .execute();

    let created = 0;
    for (const cert of expiredCerts) {
      const existing = await this.db
        .selectFrom('incidents')
        .select('id')
        .where('target_type', '=', 'ssl')
        .where('target_id', '=', cert.id)
        .where('resolved_at', 'is', null)
        .executeTakeFirst();

      if (existing) continue;

      const hostname = cert.common_name ?? cert.domain_fqdn;
      const incident = await this.db
        .insertInto('incidents')
        .values({
          monitor_id: null,
          severity: 'major',
          cause: 'SSL Certificate Expired',
          notes: `SSL certificate for ${hostname} (${cert.asset_name ?? cert.domain_fqdn}) expired on ${cert.valid_to?.toISOString().split('T')[0] ?? 'unknown date'}.`,
          started_at: new Date(),
          target_type: 'ssl',
          target_id: cert.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      created++;

      // Enqueue immediate notification
      this.queueService.addIncidentNotification(incident.id);
    }

    this.logger.log(`Expired SSL check complete: ${created} incident(s) created`);
    return created;
  }

  private async checkExists(id: string) {
    const incident = await this.db
      .selectFrom('incidents')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    return incident;
  }
}
