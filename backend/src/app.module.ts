import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DatabaseModule } from "./db/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ClientModule } from './modules/client/client.module';
import { AssetModule } from './modules/asset/asset.module';
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { AuditLogInterceptor } from "./common/interceptors/audit-log.interceptor";
import { UsersModule } from './modules/users/users.module';
import { ContractModule } from './modules/contract/contract.module';
import { DomainModule } from './modules/domain/domain.module';
import { ProviderModule } from './modules/provider/provider.module';
import { ServerModule } from './modules/server/server.module';
import { SslModule } from './modules/ssl/ssl.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { IncidentModule } from './modules/incident/incident.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { MonitorModule } from './modules/monitor/monitor.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthModule } from './modules/health/health.module';
import { CleanupModule } from './modules/cleanup/cleanup.module';
import { GlobalNotificationUsersModule } from './modules/global-notification-users/global-notification-users.module';
import { AppConfigModule } from './modules/config/config.module';
import { NotesModule } from './modules/notes/notes.module';
import { ScopesModule } from './modules/scopes/scopes.module';
import { CacheInvalidationInterceptor } from './common/interceptors/cache-invalidation.interceptor';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { PushModule } from './modules/push/push.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            ignore: "pid,hostname,req.headers,res.headers",
          },
        },
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers['set-cookie']",
            "req.remoteAddress",
            "req.remotePort",
          ],
          censor: "[REDACTED]",
        },
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
          err: (err) => ({
            type: err.type,
            message: err.message,
            ...(process.env.NODE_ENV !== "production" && err.stack
              ? { stack: err.stack.split("\n").slice(0, 4).join("\n") }
              : {}),
          }),
        },
        customLogLevel: (_req, res, err) => {
          if (res.statusCode >= 500 || err) return "error";
          if (res.statusCode >= 400) return "warn";
          return "info";
        },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    AuthModule,
    ClientModule,
    AssetModule,
    ContractModule,
    DomainModule,
    ProviderModule,
    ServerModule,
    SslModule,
    DashboardModule,
    UsersModule,
    IncidentModule,
    AuditLogModule,
    ReminderModule,
    QueueModule,
    RedisModule,
    MonitorModule,
    NotificationsModule,
    HealthModule,
    CleanupModule,
    NotesModule,
    ScopesModule,
    AppConfigModule,
    WhatsappModule,
    PushModule,
    GlobalNotificationUsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_INTERCEPTOR, useClass: CacheInvalidationInterceptor },
  ],
})
export class AppModule {}
