export const WEB_TO_LEAD_EVENT_TYPE = 'web_to_lead.submitted';

export const WEB_TO_LEAD_MAPPING_TARGETS = [
  'CONTACT_FULL_NAME',
  'CONTACT_FIRST_NAME',
  'CONTACT_LAST_NAME',
  'CONTACT_EMAIL',
  'CONTACT_PHONE',
  'COMPANY_NAME',
  'LEAD_TITLE',
  'LEAD_EMAIL',
  'LEAD_PHONE',
  'LEAD_DESCRIPTION',
  'LEAD_ESTIMATED_VALUE',
  'LEAD_PRIORITY',
  'LEAD_CUSTOM_FIELD',
  'LEAD_TAG',
] as const;

export type WebToLeadMappingTarget = (typeof WEB_TO_LEAD_MAPPING_TARGETS)[number];

export const WEB_TO_LEAD_SOURCE_FIELDS = [
  'submissionId',
  'name',
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'company',
  'subject',
  'message',
  'service',
  'budget',
  'sourceUrl',
  'referrer',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'submittedAt',
  'estimatedValue',
  'priority',
] as const;
