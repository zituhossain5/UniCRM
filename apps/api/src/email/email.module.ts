import { Global, Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { EmailController } from './email.controller';
import { EmailService, EmailTransportService } from './email.service';

@Global()
@Module({
  controllers: [EmailController],
  exports: [EmailService, EmailTransportService],
  imports: [JobsModule],
  providers: [EmailService, EmailTransportService],
})
export class EmailModule {}
