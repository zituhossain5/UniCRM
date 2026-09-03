import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

type PdfQuotation = {
  quotationNumber: string;
  issueDate: Date;
  expiryDate: Date | null;
  currency: string;
  subtotal: { toString(): string };
  discountAmount: { toString(): string };
  taxAmount: { toString(): string };
  total: { toString(): string };
  notes: string | null;
  terms: string | null;
  organization: { name: string };
  company: { name: string; email: string | null; phone: string | null };
  contact: { firstName: string; lastName: string; email: string | null } | null;
  items: Array<{
    description: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    amount: { toString(): string };
  }>;
};

@Injectable()
export class QuotationPdfService {
  generate(quotation: PdfQuotation): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        margin: 48,
        size: 'A4',
        info: { Title: quotation.quotationNumber },
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      const money = (value: { toString(): string }) =>
        `${quotation.currency} ${Number(value.toString()).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const date = (value: Date | null) =>
        value
          ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(value)
          : '-';

      document
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor('#111827')
        .text(quotation.organization.name);
      document.font('Helvetica').fontSize(9).fillColor('#64748b').text('UniCRM');
      document.moveDown(1.5);
      document
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor('#111827')
        .text('QUOTATION', { align: 'right' });
      document
        .fontSize(11)
        .fillColor('#05a89a')
        .text(quotation.quotationNumber, { align: 'right' });
      document.moveDown(1.5);

      document.font('Helvetica-Bold').fontSize(9).fillColor('#64748b').text('PREPARED FOR');
      document
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#111827')
        .text(quotation.company.name);
      if (quotation.contact) {
        document
          .font('Helvetica')
          .fontSize(10)
          .text(`${quotation.contact.firstName} ${quotation.contact.lastName}`);
        if (quotation.contact.email) document.text(quotation.contact.email);
      }
      document.moveUp(3);
      document
        .font('Helvetica')
        .fontSize(10)
        .text(`Issue date: ${date(quotation.issueDate)}`, { align: 'right' });
      document.text(`Valid until: ${date(quotation.expiryDate)}`, { align: 'right' });
      document.moveDown(3);

      const x = 48;
      const widths: [number, number, number, number] = [285, 55, 90, 90];
      const row = (
        description: string,
        quantity: string,
        rate: string,
        amount: string,
        header = false,
      ) => {
        const y = document.y;
        document
          .font(header ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .fillColor(header ? '#475569' : '#111827');
        document.text(description, x, y, { width: widths[0] });
        document.text(quantity, x + widths[0], y, { align: 'right', width: widths[1] });
        document.text(rate, x + widths[0] + widths[1], y, { align: 'right', width: widths[2] });
        document.text(amount, x + widths[0] + widths[1] + widths[2], y, {
          align: 'right',
          width: widths[3],
        });
        document.y = Math.max(document.y, y + 22);
      };
      row('Description', 'Qty', 'Rate', 'Amount', true);
      document
        .moveTo(x, document.y - 5)
        .lineTo(547, document.y - 5)
        .strokeColor('#cbd5e1')
        .stroke();
      for (const item of quotation.items)
        row(item.description, item.quantity.toString(), money(item.unitPrice), money(item.amount));
      document.moveTo(330, document.y).lineTo(547, document.y).strokeColor('#cbd5e1').stroke();
      document.moveDown();
      const totalRow = (label: string, value: { toString(): string }, bold = false) => {
        document
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 12 : 10)
          .fillColor('#111827');
        document.text(label, 330, document.y, { width: 90 });
        document.text(money(value), 420, document.y - (bold ? 14 : 12), {
          align: 'right',
          width: 127,
        });
      };
      totalRow('Subtotal', quotation.subtotal);
      totalRow('Discount', quotation.discountAmount);
      totalRow('Tax', quotation.taxAmount);
      document.moveDown(0.4);
      totalRow('TOTAL', quotation.total, true);

      if (quotation.notes) {
        document.moveDown(2).font('Helvetica-Bold').fontSize(10).text('Notes');
        document.font('Helvetica').fontSize(9).fillColor('#334155').text(quotation.notes);
      }
      if (quotation.terms) {
        document.moveDown().font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Terms');
        document.font('Helvetica').fontSize(9).fillColor('#334155').text(quotation.terms);
      }
      document.end();
    });
  }
}
