import { FeedbackMessage, type FeedbackTone } from '@unicrm/ui';
import type { ReactNode } from 'react';

export function AuthMessage({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: FeedbackTone;
}) {
  return <FeedbackMessage tone={tone}>{children}</FeedbackMessage>;
}
