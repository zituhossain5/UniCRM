'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type { Tag } from '@/lib/configuration-types';
import { Button, ConfirmationDialog, Input, LoadingState } from '@unicrm/ui';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

export function TagsSettings() {
  const current = useCurrentUser();
  const [tags, setTags] = useState<Tag[]>();
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState('');
  const canManage = current.permissions.includes('tag.manage');
  async function load() {
    try {
      setTags((await apiRequest<{ data: Tag[] }>('/tags')).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load tags.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await apiRequest('/tags', {
        method: 'POST',
        body: JSON.stringify({ name: new FormData(form).get('name') }),
      });
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create tag.');
    }
  }
  async function rename(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    try {
      await apiRequest(`/tags/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: new FormData(event.currentTarget).get('name') }),
      });
      setEditing(undefined);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rename tag.');
    }
  }
  async function remove(id: string) {
    try {
      await apiRequest(`/tags/${id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete tag.');
    }
  }
  if (!tags && !error) return <LoadingState label="Loading tags" />;
  return (
    <section className="settings-section settings-section--wide">
      <header>
        <h2>Tags</h2>
        <p>Create reusable organization tags for CRM records and projects.</p>
      </header>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {canManage ? (
        <form className="settings-inline-form" onSubmit={(event) => void create(event)}>
          <Input
            aria-label="New tag name"
            name="name"
            placeholder="Tag name"
            required
            maxLength={80}
          />
          <Button type="submit">
            <Plus size={14} />
            Add tag
          </Button>
        </form>
      ) : null}
      <div className="configuration-list">
        {tags?.map((tag) =>
          editing === tag.id ? (
            <form
              className="configuration-row"
              key={tag.id}
              onSubmit={(event) => void rename(event, tag.id)}
            >
              <Input defaultValue={tag.name} name="name" required />
              <div>
                <Button type="submit">Save</Button>
                <Button onClick={() => setEditing(undefined)} variant="ghost">
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="configuration-row" key={tag.id}>
              <strong>{tag.name}</strong>
              {canManage ? (
                <div>
                  <Button onClick={() => setEditing(tag.id)} variant="ghost">
                    <Pencil size={14} />
                    Rename
                  </Button>
                  <ConfirmationDialog
                    title="Delete tag?"
                    description="The tag will be removed from records. CRM records are not deleted."
                    confirmLabel="Delete"
                    onConfirm={() => void remove(tag.id)}
                    trigger={
                      <Button variant="ghost">
                        <Trash2 size={14} />
                        Delete
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </div>
          ),
        )}
      </div>
      {tags?.length === 0 ? <p className="record-empty">No tags have been created.</p> : null}
    </section>
  );
}
