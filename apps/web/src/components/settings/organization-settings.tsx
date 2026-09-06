'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { Button, Input, LoadingState } from '@unicrm/ui';
import { useEffect, useState, type FormEvent } from 'react';

interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  defaultCurrency: string;
}

export function OrganizationSettings() {
  const user = useCurrentUser();
  const [organization, setOrganization] = useState<Organization>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const canUpdate = user.permissions.includes('settings.update');
  useEffect(() => {
    void apiRequest<{ data: Organization }>('/organization')
      .then(({ data }) => setOrganization(data))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load organization.'),
      );
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiRequest<{ data: Organization }>('/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          name: data.get('name'),
          defaultCurrency: data.get('defaultCurrency'),
        }),
      });
      setOrganization(result.data);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Update failed.');
    }
  }
  if (!organization && !error) return <LoadingState label="Loading organization" />;
  return (
    <section className="settings-section">
      <header>
        <h2>Organization</h2>
        <p>Basic details for the current UniCRM workspace.</p>
      </header>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {organization ? (
        <form className="settings-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>Name</span>
            <Input defaultValue={organization.name} disabled={!canUpdate} name="name" required />
          </label>
          <label>
            <span>Slug</span>
            <Input disabled value={organization.slug} />
          </label>
          <label>
            <span>Default currency</span>
            <Input
              defaultValue={organization.defaultCurrency}
              disabled={!canUpdate}
              name="defaultCurrency"
              required
              maxLength={3}
            />
          </label>
          <div className="settings-meta">
            <span>Status: {organization.status}</span>
            <span>Created {new Date(organization.createdAt).toLocaleDateString()}</span>
          </div>
          {saved ? <AuthMessage tone="success">Organization updated.</AuthMessage> : null}
          {canUpdate ? <Button type="submit">Save changes</Button> : null}
        </form>
      ) : null}
    </section>
  );
}
