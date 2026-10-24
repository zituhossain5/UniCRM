import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DemoCapabilityService } from './demo-capability.service';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { DemoSeederService } from './demo-seeder.service';
import { DemoCleanupService } from './demo-cleanup.service';
import { AttachmentsModule } from '../attachments/attachments.module';
import { IdentityBootstrapService } from '../bootstrap.service';

@Module({
  imports: [AuthModule, AttachmentsModule],
  controllers: [DemoController],
  providers: [
    DemoCapabilityService,
    DemoService,
    DemoSeederService,
    DemoCleanupService,
    IdentityBootstrapService,
  ],
  exports: [DemoCapabilityService, DemoCleanupService],
})
export class DemoModule {}
