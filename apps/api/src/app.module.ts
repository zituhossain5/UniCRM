import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { CsrfGuard } from './auth/csrf.guard';
import { PermissionGuard } from './auth/permission.guard';
import { IdentityBootstrapService } from './bootstrap.service';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../../.env', '.env'],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    RedisModule,
    EmailModule,
    AuthModule,
    UsersModule,
    RolesModule,
    OrganizationsModule,
    CompaniesModule,
    ContactsModule,
    PipelinesModule,
    LeadsModule,
    TasksModule,
    ProjectsModule,
    AttachmentsModule,
    QuotationsModule,
    PaymentsModule,
    HealthModule,
  ],
  providers: [
    IdentityBootstrapService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
