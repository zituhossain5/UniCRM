import { EmailSettings } from '@/components/settings/email-settings';
import { MailboxesSettings } from '@/components/settings/mailboxes-settings';
export default function Page() {
  return (
    <div className="email-settings-page">
      <EmailSettings />
      <MailboxesSettings />
    </div>
  );
}
