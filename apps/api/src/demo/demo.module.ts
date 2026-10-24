import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DemoCapabilityService } from './demo-capability.service';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { DemoSeederService } from './demo-seeder.service';
import { DemoCleanupService } from './demo-cleanup.service';
import { AttachmentsModule } from '../attachments/attachments.module';
import { IdentityBootstrapService } from '../bootstrap.service';
import { DemoObservabilityService } from './demo-observability.service';
import { DemoQuotaService } from './demo-quota.service';
import { DemoTurnstileService } from './demo-turnstile.service';

@Module({
  imports: [AuthModule, AttachmentsModule],
  controllers: [DemoController],
  providers: [
    DemoCapabilityService,
    DemoService,
    DemoSeederService,
    DemoCleanupService,
    DemoObservabilityService,
    DemoQuotaService,
    DemoTurnstileService,
    IdentityBootstrapService,
  ],
  exports: [DemoCapabilityService, DemoCleanupService, DemoObservabilityService, DemoQuotaService],
})
export class DemoModule {}
