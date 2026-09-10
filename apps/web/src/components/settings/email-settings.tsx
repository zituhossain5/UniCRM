'use client';
import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { Button, Input, LoadingState } from '@unicrm/ui';
import { useEffect, useState, type FormEvent } from 'react';

type Settings = { fromName: string | null; fromAddress: string | null; replyTo: string | null };
export function EmailSettings() {
  const user = useCurrentUser();
  const [settings, setSettings] = useState<Settings>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const manage = user.permissions.includes('email_template.manage');
  useEffect(() => {
    void apiRequest<{ data: Settings }>('/email-settings')
      .then((result) => setSettings(result.data))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load email settings.'),
      );
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiRequest<{
        data: { emailFromName: string; emailFromAddress: string; emailReplyTo: string | null };
      }>('/email-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          fromName: data.get('fromName'),
          fromAddress: data.get('fromAddress'),
          replyTo: data.get('replyTo') || undefined,
        }),
      });
      setSettings({
        fromName: result.data.emailFromName,
        fromAddress: result.data.emailFromAddress,
        replyTo: result.data.emailReplyTo,
      });
      setSaved(true);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save email settings.');
    }
  }
  if (!settings && !error) return <LoadingState label="Loading email settings" />;
  return (
    <section className="settings-section">
      <header>
        <h2>Email</h2>
        <p>
          Organization sender identity. SMTP credentials remain server-managed environment settings.
        </p>
      </header>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {settings ? (
        <form className="settings-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>From name</span>
            <Input
              name="fromName"
              defaultValue={settings.fromName ?? ''}
              disabled={!manage}
              required
            />
          </label>
          <label>
            <span>From address</span>
            <Input
              name="fromAddress"
              type="email"
              defaultValue={settings.fromAddress ?? ''}
              disabled={!manage}
              required
            />
          </label>
          <label>
            <span>Reply-to</span>
            <Input
              name="replyTo"
              type="email"
              defaultValue={settings.replyTo ?? ''}
              disabled={!manage}
            />
          </label>
          {saved ? <AuthMessage tone="success">Email identity updated.</AuthMessage> : null}
          {manage ? <Button type="submit">Save changes</Button> : null}
        </form>
      ) : null}
    </section>
  );
}
