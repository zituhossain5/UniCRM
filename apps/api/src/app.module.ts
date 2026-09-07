import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { CsrfGuard } from './auth/csrf.guard';
import { PermissionGuard } from './auth/permission.guard';
import { IdentityBootstrapService } from './bootstrap.service';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { RequestLoggingMiddleware } from './common/request-logging.middleware';
import { StructuredLogger } from './common/structured-logger.service';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { RedisModule } from './redis/redis.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { ContactsModule } from './contacts/contacts.module';
import { LeadsModule } from './leads/leads.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { PaymentsModule } from './payments/payments.module';
import { QuotationsModule } from './quotations/quotations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { SearchModule } from './search/search.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { TagsModule } from './tags/tags.module';
import { SavedViewsModule } from './saved-views/saved-views.module';
import { DataManagementModule } from './data-management/data-management.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../../.env', '.env'],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    RedisModule,
    JobsModule,
    EmailModule,
    AuthModule,
    NotificationsModule,
    UsersModule,
    RolesModule,
    OrganizationsModule,
    CompaniesModule,
    ContactsModule,
    PipelinesModule,
    CustomFieldsModule,
    TagsModule,
    SavedViewsModule,
    DataManagementModule,
    LeadsModule,
    TasksModule,
    ProjectsModule,
    AttachmentsModule,
    QuotationsModule,
    PaymentsModule,
    DashboardModule,
    ReportsModule,
    SearchModule,
    HealthModule,
  ],
  providers: [
    IdentityBootstrapService,
    StructuredLogger,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, RequestLoggingMiddleware).forRoutes('*');
  }
}
