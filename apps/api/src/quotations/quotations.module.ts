import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuditModule } from '../audit/audit.module';
import { QuotationsController } from './quotations.controller';
import { QuotationPdfService } from './quotation-pdf.service';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [AttachmentsModule, AuditModule],
  controllers: [QuotationsController],
  providers: [QuotationPdfService, QuotationsService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
