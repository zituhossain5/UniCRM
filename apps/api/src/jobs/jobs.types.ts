export const UNICRM_QUEUE = 'unicrm';

export type EmailJob = {
  subject: string;
  text: string;
  to: string;
};
