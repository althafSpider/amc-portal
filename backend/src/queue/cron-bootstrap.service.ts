import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely } from 'kysely';
import { DB } from '../db/types.generated';
import { QueueService } from './queue.service';

@Injectable()
export class CronBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CronBootstrapService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<DB>,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    // await this.scheduleExistingDomains();
    // await this.scheduleExistingSslCertificates();
    // await this.scheduleReminderJobs();
  }

  private async scheduleReminderJobs() {
    try {
      await this.queueService.scheduleReminderCreation();
      await this.queueService.scheduleReminderSending();
      await this.queueService.scheduleReminderRetry();
      this.logger.log('Scheduled reminder creation (every 6h), sending (every 3min), and retry (every 15min) jobs');
    } catch (err) {
      this.logger.error(`Failed to schedule reminder jobs: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async scheduleExistingDomains() {
    try {
      const domains = await this.db
        .selectFrom('domains')
        .select(['id', 'fqdn'])
        .execute();

      if (domains.length === 0) {
        this.logger.log('No existing domains to schedule for refresh');
        return;
      }

      const cronPattern = this.configService.get('DOMAIN_REFRESH_CRON', '0 */6 * * *');
      let scheduled = 0;

      for (const domain of domains) {
        try {
          await this.queueService.scheduleDomainRefresh(domain.id, cronPattern);
          scheduled++;
        } catch (err) {
          this.logger.warn(
            `Failed to schedule refresh for domain ${domain.id} (${domain.fqdn}): ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      this.logger.log(`Scheduled domain refresh for ${scheduled}/${domains.length} existing domains (cron: "${cronPattern}")`);
    } catch (err) {
      this.logger.error(`Failed to schedule existing domains: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async scheduleExistingSslCertificates() {
    try {
      const certs = await this.db
        .selectFrom('ssl_certificates')
        .select(['id', 'common_name'])
        .execute();

      if (certs.length === 0) {
        this.logger.log('No existing SSL certificates to schedule for refresh');
        return;
      }

      const cronPattern = this.configService.get('SSL_REFRESH_CRON', '0 */6 * * *');
      let scheduled = 0;

      for (const cert of certs) {
        try {
          await this.queueService.scheduleSslRefresh(cert.id, cronPattern);
          scheduled++;
        } catch (err) {
          this.logger.warn(
            `Failed to schedule refresh for SSL cert ${cert.id} (${cert.common_name ?? 'N/A'}): ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      this.logger.log(`Scheduled SSL refresh for ${scheduled}/${certs.length} existing certificates (cron: "${cronPattern}")`);
    } catch (err) {
      this.logger.error(`Failed to schedule existing SSL certificates: ${err instanceof Error ? err.message : err}`);
    }
  }
}
