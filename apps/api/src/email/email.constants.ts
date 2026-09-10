export const CRM_EMAIL_DELIVERY_JOB = 'crm-email-delivery';
export const CRM_EMAIL_RECOVERY_JOB = 'crm-email-recovery';

export const EMAIL_TEMPLATE_VARIABLES = [
  'contact.firstName',
  'contact.lastName',
  'company.name',
  'lead.title',
  'project.name',
  'quotation.quotationNumber',
  'user.firstName',
  'organization.name',
] as const;

export const EMAIL_RECIPIENT_SOURCES = ['LEAD_EMAIL', 'CONTACT_EMAIL', 'PRIMARY_CONTACT'] as const;

export type EmailRecipientSource = (typeof EMAIL_RECIPIENT_SOURCES)[number];
