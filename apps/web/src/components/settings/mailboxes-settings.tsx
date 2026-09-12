'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type { MailboxConnection } from '@/lib/mailbox-types';
import { Badge, Button, Input, LoadingState, Sheet, Switch } from '@unicrm/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';

type EditorState = MailboxConnection | 'new' | null;

export function MailboxesSettings() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState>(null);
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null);
  const canManage = user.permissions.includes('mailbox.manage');
  const mailboxes = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => apiRequest<{ data: MailboxConnection[] }>('/mailboxes'),
    refetchInterval: (query) =>
      query.state.data?.data.some((mailbox) => mailbox.status === 'SYNCING') ? 2500 : false,
  });
  const action = useMutation({
    mutationFn: ({ id, operation }: { id: string; operation: string }) =>
      apiRequest(`/mailboxes/${id}/${operation}`, { method: 'POST' }),
    onSuccess: async (_, variables) => {
      setMessage({
        success: true,
        text:
          variables.operation === 'sync'
            ? 'Mailbox synchronization queued.'
            : `${variables.operation === 'test-imap' ? 'IMAP' : 'SMTP'} connection succeeded.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
    },
    onError: (cause) =>
      setMessage({
        success: false,
        text: cause instanceof Error ? cause.message : 'Mailbox action failed.',
      }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest(`/mailboxes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['mailboxes'] }),
  });

  return (
    <section className="settings-section settings-section--wide mailbox-settings">
      <header className="settings-section-header">
        <div>
          <h2>Mailboxes</h2>
          <p>Connect organization mailboxes for secure IMAP synchronization and SMTP replies.</p>
        </div>
        {canManage ? (
          <Button onClick={() => setEditor('new')}>
            <Plus size={15} /> Connect mailbox
          </Button>
        ) : null}
      </header>
      {message ? (
        <AuthMessage tone={message.success ? 'success' : 'error'}>{message.text}</AuthMessage>
      ) : null}
      {mailboxes.isLoading ? (
        <LoadingState label="Loading mailboxes" />
      ) : mailboxes.data?.data.length ? (
        <div className="mailbox-card-list">
          {mailboxes.data.data.map((mailbox) => (
            <article className="mailbox-card" key={mailbox.id}>
              <div className="mailbox-card-main">
                <div>
                  <strong>{mailbox.name}</strong>
                  <p>{mailbox.emailAddress}</p>
                </div>
                <MailboxStatusBadge status={mailbox.status} />
              </div>
              <div className="settings-meta">
                <span>
                  IMAP {mailbox.imapHost}:{mailbox.imapPort}
                </span>
                <span>
                  SMTP {mailbox.smtpHost}:{mailbox.smtpPort}
                </span>
                <span>
                  Last sync{' '}
                  {mailbox.lastSyncedAt ? new Date(mailbox.lastSyncedAt).toLocaleString() : 'Never'}
                </span>
              </div>
              {mailbox.safeErrorSummary ? (
                <p className="overdue-text">{mailbox.safeErrorSummary}</p>
              ) : null}
              {canManage ? (
                <div className="mailbox-card-actions">
                  <Button variant="outline" onClick={() => setEditor(mailbox)}>
                    <Pencil size={14} /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    loading={action.isPending && action.variables?.operation === 'test-imap'}
                    onClick={() => action.mutate({ id: mailbox.id, operation: 'test-imap' })}
                  >
                    Test IMAP
                  </Button>
                  <Button
                    variant="outline"
                    loading={action.isPending && action.variables?.operation === 'test-smtp'}
                    onClick={() => action.mutate({ id: mailbox.id, operation: 'test-smtp' })}
                  >
                    Test SMTP
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={mailbox.status === 'DISABLED'}
                    loading={action.isPending && action.variables?.operation === 'sync'}
                    onClick={() => action.mutate({ id: mailbox.id, operation: 'sync' })}
                  >
                    Sync now
                  </Button>
                  <Switch
                    checked={mailbox.status !== 'DISABLED'}
                    disabled={toggle.isPending}
                    label="Enabled"
                    onCheckedChange={(enabled) => toggle.mutate({ id: mailbox.id, enabled })}
                  />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-copy">No mailbox is connected yet.</p>
      )}
      <MailboxEditor mailbox={editor} onClose={() => setEditor(null)} />
    </section>
  );
}

function MailboxEditor({ mailbox, onClose }: { mailbox: EditorState; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest<{ data: MailboxConnection }>(
        mailbox === 'new' ? '/mailboxes' : `/mailboxes/${mailbox?.id}`,
        { method: mailbox === 'new' ? 'POST' : 'PATCH', body: JSON.stringify(payload) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      onClose();
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : 'Could not save mailbox.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const credentialValue = data.get('credential');
    const credential = typeof credentialValue === 'string' ? credentialValue : '';
    save.mutate({
      name: data.get('name'),
      emailAddress: data.get('emailAddress'),
      displayName: data.get('displayName'),
      imapHost: data.get('imapHost'),
      imapPort: Number(data.get('imapPort')),
      imapSecure: data.get('imapSecure') === 'on',
      smtpHost: data.get('smtpHost'),
      smtpPort: Number(data.get('smtpPort')),
      smtpSecure: data.get('smtpSecure') === 'on',
      username: data.get('username'),
      ...(credential ? { credential } : {}),
    });
  }
  const current = mailbox === 'new' ? undefined : (mailbox ?? undefined);
  return (
    <Sheet
      open={mailbox !== null}
      onOpenChange={(open) => !open && onClose()}
      title={mailbox === 'new' ? 'Connect mailbox' : 'Edit mailbox'}
      description="Credentials are encrypted at rest and are never returned after saving."
      trigger={
        <button className="visually-hidden" type="button">
          Mailbox editor
        </button>
      }
    >
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <form className="dialog-form mailbox-form" onSubmit={submit}>
        <label>
          <span>Name</span>
          <Input name="name" defaultValue={current?.name} required />
        </label>
        <label>
          <span>Email address</span>
          <Input name="emailAddress" type="email" defaultValue={current?.emailAddress} required />
        </label>
        <label>
          <span>Display name</span>
          <Input name="displayName" defaultValue={current?.displayName ?? ''} />
        </label>
        <div className="form-two-columns">
          <label>
            <span>IMAP host</span>
            <Input name="imapHost" defaultValue={current?.imapHost} required />
          </label>
          <label>
            <span>IMAP port</span>
            <Input
              name="imapPort"
              type="number"
              min={1}
              max={65535}
              defaultValue={current?.imapPort ?? 993}
              required
            />
          </label>
        </div>
        <label className="mailbox-checkbox">
          <input name="imapSecure" type="checkbox" defaultChecked={current?.imapSecure ?? true} />{' '}
          Use implicit TLS for IMAP
        </label>
        <div className="form-two-columns">
          <label>
            <span>SMTP host</span>
            <Input name="smtpHost" defaultValue={current?.smtpHost} required />
          </label>
          <label>
            <span>SMTP port</span>
            <Input
              name="smtpPort"
              type="number"
              min={1}
              max={65535}
              defaultValue={current?.smtpPort ?? 465}
              required
            />
          </label>
        </div>
        <label className="mailbox-checkbox">
          <input name="smtpSecure" type="checkbox" defaultChecked={current?.smtpSecure ?? true} />{' '}
          Use implicit TLS for SMTP
        </label>
        <label>
          <span>Username</span>
          <Input
            name="username"
            autoComplete="username"
            defaultValue={current?.username}
            required
          />
        </label>
        <label>
          <span>{current ? 'Replace credential' : 'Password / app password'}</span>
          <Input
            name="credential"
            type="password"
            autoComplete="new-password"
            required={!current}
            placeholder={current ? 'Leave blank to keep current credential' : undefined}
          />
        </label>
        <Button loading={save.isPending} type="submit">
          {current ? 'Save changes' : 'Connect mailbox'}
        </Button>
      </form>
    </Sheet>
  );
}

function MailboxStatusBadge({ status }: { status: MailboxConnection['status'] }) {
  return (
    <Badge
      tone={
        status === 'CONNECTED'
          ? 'success'
          : status === 'ERROR'
            ? 'danger'
            : status === 'SYNCING'
              ? 'warning'
              : 'neutral'
      }
    >
      {status}
    </Badge>
  );
}
