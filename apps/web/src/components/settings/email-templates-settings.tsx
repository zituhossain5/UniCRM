'use client';
import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { Badge, Button, Input, LoadingState, Sheet, Textarea } from '@unicrm/ui';
import { Copy, Edit3, Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
  active: boolean;
  updatedAt: string;
};
const FORM_ID = 'email-template-form';
export function EmailTemplatesSettings() {
  const user = useCurrentUser();
  const manage = user.permissions.includes('email_template.manage');
  const [templates, setTemplates] = useState<Template[]>();
  const [editing, setEditing] = useState<Template | null>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      apiRequest<{ data: Template[] }>('/email-templates')
        .then((result) => setTemplates(result.data))
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : 'Could not load templates.'),
        ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest(editing ? `/email-templates/${editing.id}` : '/email-templates', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          subject: data.get('subject'),
          body: data.get('body'),
          active: data.get('active') === 'on',
        }),
      });
      setOpen(false);
      setEditing(null);
      setError('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save template.');
    } finally {
      setBusy(false);
    }
  }
  async function patch(template: Template, values: Partial<Template>) {
    try {
      await apiRequest(`/email-templates/${template.id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update template.');
    }
  }
  async function sendTest(template: Template) {
    const to = window.prompt('Send test email to');
    if (!to) return;
    try {
      await apiRequest(`/email-templates/${template.id}/test`, {
        method: 'POST',
        body: JSON.stringify({ to }),
      });
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not queue test email.');
    }
  }
  if (!templates && !error) return <LoadingState label="Loading email templates" />;
  return (
    <section className="settings-section settings-section--wide">
      <header className="settings-section-header">
        <div>
          <h2>Email Templates</h2>
          <p>Reusable plain-text transactional messages with controlled CRM variables.</p>
        </div>
        {manage ? (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus size={15} /> New template
          </Button>
        ) : null}
      </header>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <div className="settings-list">
        {templates?.map((template) => (
          <article className="settings-list-item" key={template.id}>
            <div>
              <strong>{template.name}</strong>
              <p>{template.subject}</p>
              <details>
                <summary>Preview</summary>
                <pre>{template.body}</pre>
              </details>
              <small>Updated {new Date(template.updatedAt).toLocaleDateString()}</small>
            </div>
            <div className="record-actions">
              <Badge tone={template.active ? 'success' : 'neutral'}>
                {template.active ? 'Active' : 'Inactive'}
              </Badge>
              {manage ? (
                <>
                  <Button variant="ghost" onClick={() => void sendTest(template)}>
                    Send test
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(template);
                      setOpen(true);
                    }}
                  >
                    <Edit3 size={14} /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void apiRequest(`/email-templates/${template.id}/duplicate`, {
                        method: 'POST',
                      }).then(load)
                    }
                  >
                    <Copy size={14} /> Duplicate
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void patch(template, { active: !template.active })}
                  >
                    {template.active ? 'Deactivate' : 'Activate'}
                  </Button>
                </>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Edit email template' : 'New email template'}
        description={
          'Allowed variables: {{contact.firstName}}, {{contact.lastName}}, {{company.name}}, {{lead.title}}, {{project.name}}, {{quotation.quotationNumber}}, {{user.firstName}}, {{organization.name}}'
        }
        trigger={<span />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form={FORM_ID} loading={busy} type="submit">
              Save template
            </Button>
          </>
        }
      >
        <form className="dialog-form" id={FORM_ID} onSubmit={(event) => void submit(event)}>
          <label>
            <span>Name</span>
            <Input name="name" defaultValue={editing?.name ?? ''} required />
          </label>
          <label>
            <span>Subject</span>
            <Input name="subject" defaultValue={editing?.subject ?? ''} required />
          </label>
          <label>
            <span>Message</span>
            <Textarea name="body" defaultValue={editing?.body ?? ''} rows={14} required />
          </label>
          <label className="ui-choice-label">
            <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Active
          </label>
        </form>
      </Sheet>
    </section>
  );
}
