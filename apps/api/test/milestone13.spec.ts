import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { renderTemplate, validateTemplate } from '../src/email/template-renderer';

describe('Milestone 13 controlled email templates', () => {
  it('renders only the documented CRM variables deterministically', () => {
    expect(
      renderTemplate('Hi {{contact.firstName}} — {{organization.name}}', {
        'contact.firstName': 'Amina',
        'organization.name': 'UniCRM Demo',
      }),
    ).toBe('Hi Amina — UniCRM Demo');
  });

  it('renders missing approved values as empty text', () => {
    expect(renderTemplate('{{company.name}}/{{lead.title}}', { 'lead.title': 'Renewal' })).toBe(
      '/Renewal',
    );
  });

  it('rejects arbitrary variables and expression-like syntax', () => {
    expect(() => validateTemplate('{{process.env.SMTP_PASSWORD}}')).toThrow(BadRequestException);
    expect(() => validateTemplate('{{ user.firstName.toUpperCase() }}')).toThrow(
      BadRequestException,
    );
  });
});
