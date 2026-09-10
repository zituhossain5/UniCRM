'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import {
  mergeQueuedEmailHistory,
  shouldPollEmailHistory,
  shouldRefreshRelatedCrmActivity,
  type EmailHistoryResponse,
} from '@/lib/email-status';
import { Badge, Button, Input, Select, Sheet, Textarea } from '@unicrm/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Mail } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

type EntityType = 'LEAD' | 'CONTACT' | 'COMPANY';
type Template = { id: string; name: string; subject: string; body: string };
type Message = {
  id: string;
  subject: string;
  toAddresses: string[];
  fromName: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
  sentAt?: string;
  failedAt?: string;
  createdAt: string;
  safeErrorSummary?: string;
};
type Context = {
  recipient?: string;
  settings: { fromName?: string; fromAddress?: string; replyTo?: string };
  templates: Template[];
};

export function RecordEmail({
  entityId,
  entityType,
  onDeliveryStatusChange,
}: {
  entityId: string;
  entityType: EntityType;
  onDeliveryStatusChange?: () => void;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const previousMessages = useRef<Message[]>([]);
  const canRead = user.permissions.includes('email.read');
  const canSend = user.permissions.includes('email.send');
  const contextKey = ['emails', 'compose-context', entityType, entityId] as const;
  const historyKey = ['emails', 'history', entityType, entityId] as const;

  const composeContext = useQuery({
    enabled: open && canRead,
    queryKey: contextKey,
    queryFn: () =>
      apiRequest<{ data: Context }>(
        `/emails/compose-context?relatedEntityType=${entityType}&relatedEntityId=${entityId}`,
      ),
  });
  const emailHistory = useQuery({
    enabled: open && canRead,
    queryKey: historyKey,
    queryFn: () =>
      apiRequest<EmailHistoryResponse<Message>>(
        `/emails?relatedEntityType=${entityType}&relatedEntityId=${entityId}`,
      ),
    refetchInterval: (query) => shouldPollEmailHistory(query.state.data),
  });
  const context = composeContext.data?.data;
  const messages = emailHistory.data?.data ?? [];

  useEffect(() => {
    if (!context?.recipient) return;
    setTo((current) => current || context.recipient || '');
  }, [context?.recipient]);

  useEffect(() => {
    const previous = previousMessages.current;
    if (open && shouldRefreshRelatedCrmActivity(previous, messages)) onDeliveryStatusChange?.();
    previousMessages.current = messages;
  }, [messages, onDeliveryStatusChange, open]);

  useEffect(() => {
    const cause = composeContext.error ?? emailHistory.error;
    if (cause) setError(cause instanceof Error ? cause.message : 'Could not load email composer.');
  }, [composeContext.error, emailHistory.error]);

  const queueEmail = useMutation({
    mutationFn: () =>
      apiRequest<{ data: Message }>('/emails', {
        method: 'POST',
        body: JSON.stringify({
          relatedEntityType: entityType,
          relatedEntityId: entityId,
          ...(templateId ? { templateId } : {}),
          to: split(to),
          cc: split(cc),
          subject,
          body,
        }),
      }),
    onSuccess: async (result) => {
      queryClient.setQueryData<EmailHistoryResponse<Message>>(historyKey, (current) => ({
        data: mergeQueuedEmailHistory(current?.data, result.data),
      }));
      setSubject('');
      setBody('');
      setTemplateId(null);
      setCc('');
      await queryClient.invalidateQueries({ queryKey: historyKey });
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'Could not queue email.');
    },
  });

  async function selectTemplate(id: string | null) {
    setTemplateId(id);
    if (!id) return;
    try {
      const result = await apiRequest<{ data: { subject: string; body: string } }>(
        `/email-templates/${id}/preview`,
        {
          method: 'POST',
          body: JSON.stringify({ relatedEntityType: entityType, relatedEntityId: entityId }),
        },
      );
      setSubject(result.data.subject);
      setBody(result.data.body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not render template.');
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    queueEmail.mutate();
  }

  if (!canRead && !canSend) return null;
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Email"
      description="Send a transactional CRM email and review delivery history."
      trigger={
        <Button variant="outline">
          <Mail size={15} /> Send email
        </Button>
      }
    >
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {canSend ? (
        <form className="dialog-form" onSubmit={submit}>
          <label>
            <span>From</span>
            <Input
              disabled
              value={
                context?.settings.fromAddress
                  ? `${context.settings.fromName} <${context.settings.fromAddress}>`
                  : 'Configure Settings -> Email first'
              }
            />
          </label>
          <label>
            <span>To</span>
            <Input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="recipient@example.com"
              required
            />
          </label>
          <label>
            <span>CC</span>
            <Input
              value={cc}
              onChange={(event) => setCc(event.target.value)}
              placeholder="Comma-separated (optional)"
            />
          </label>
          <label>
            <span>Template</span>
            <Select
              value={templateId}
              onValueChange={(value) => void selectTemplate(value)}
              placeholder="No template"
              options={(context?.templates ?? []).map((template) => ({
                label: template.name,
                value: template.id,
              }))}
            />
          </label>
          <label>
            <span>Subject</span>
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} required />
          </label>
          <label>
            <span>Message</span>
            <Textarea
              rows={10}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
            />
          </label>
          <Button
            disabled={!context?.settings.fromAddress || queueEmail.isPending}
            loading={queueEmail.isPending}
            type="submit"
          >
            Queue email
          </Button>
        </form>
      ) : null}
      <section className="record-email-history">
        <h3>Email history</h3>
        {messages.length ? (
          messages.map((message) => (
            <article key={message.id}>
              <div>
                <strong>{message.subject}</strong>
                <p>
                  {message.toAddresses.join(', ')} ·{' '}
                  {new Date(
                    message.sentAt ?? message.failedAt ?? message.createdAt,
                  ).toLocaleString()}
                </p>
                {message.safeErrorSummary ? <p>{message.safeErrorSummary}</p> : null}
              </div>
              <Badge
                tone={
                  message.status === 'SENT'
                    ? 'success'
                    : message.status === 'FAILED'
                      ? 'danger'
                      : 'warning'
                }
              >
                {message.status === 'QUEUED' || message.status === 'SENDING' ? (
                  <LoaderCircle aria-hidden="true" className="ui-spin" size={12} />
                ) : null}
                {message.status}
              </Badge>
            </article>
          ))
        ) : (
          <p>No email has been sent from this record.</p>
        )}
      </section>
    </Sheet>
  );
}

function split(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
