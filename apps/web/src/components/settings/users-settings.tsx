'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { emitCrmDataChanged, onCrmDataChanged } from '@/lib/crm-events';
import { Badge, Button, ConfirmationDialog, Dialog, Input, LoadingState, Select } from '@unicrm/ui';
import { RefreshCw, UserPlus, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

interface Role {
  id: string;
  name: string;
}
interface UserRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  userRoles: Array<{ role: Role }>;
  invitation: { createdAt: string; expiresAt: string; role: Role } | null;
}

export function UsersSettings() {
  const current = useCurrentUser();
  const [users, setUsers] = useState<UserRecord[]>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyUserId, setBusyUserId] = useState<string>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const canInvite = current.permissions.includes('user.invite');
  const canUpdate = current.permissions.includes('user.update');
  const load = useCallback(async () => {
    try {
      const [userResult, roleResult] = await Promise.all([
        apiRequest<{ data: UserRecord[] }>('/users'),
        apiRequest<{ data: Role[] }>('/roles'),
      ]);
      setUsers(userResult.data);
      setRoles(roleResult.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load users.');
    }
  }, []);
  useEffect(() => {
    void load();
    const unsubscribe = onCrmDataChanged(['users'], () => void load());
    const refresh = () => void load();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [load]);
  useEffect(() => {
    if (!users?.some(({ status }) => status === 'INVITED')) return;
    const interval = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(interval);
  }, [load, users]);

  async function update(userId: string, data: { roleId?: string; status?: string }) {
    try {
      setError('');
      setMessage('');
      await apiRequest(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) });
      emitCrmDataChanged(['users']);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'User update failed.');
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setError('');
      setMessage('');
      await apiRequest('/users/invitations', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(data)),
      });
      setInviteOpen(false);
      setMessage('Invitation sent.');
      emitCrmDataChanged(['users']);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invitation failed.');
    }
  }

  async function resendInvitation(user: UserRecord) {
    setBusyUserId(user.id);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/users/${user.id}/invitation/resend`, { method: 'POST' });
      setMessage(`Invitation resent to ${user.email}.`);
      emitCrmDataChanged(['users']);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resend invitation.');
    } finally {
      setBusyUserId(undefined);
    }
  }

  async function cancelInvitation(user: UserRecord) {
    setBusyUserId(user.id);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/users/${user.id}/invitation`, { method: 'DELETE' });
      setMessage(`Invitation for ${user.email} cancelled.`);
      emitCrmDataChanged(['users']);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not cancel invitation.');
    } finally {
      setBusyUserId(undefined);
    }
  }

  return (
    <section className="settings-section settings-section--wide">
      <header className="settings-section-header">
        <div>
          <h2>Users</h2>
          <p>People with access to {current.organization.name}.</p>
        </div>
        {canInvite ? (
          <Dialog
            description="Send a one-time, expiring invitation."
            onOpenChange={setInviteOpen}
            open={inviteOpen}
            title="Invite user"
            trigger={
              <Button>
                <UserPlus size={15} />
                Invite user
              </Button>
            }
          >
            <form className="dialog-form" onSubmit={(event) => void invite(event)}>
              <div className="form-two-columns">
                <label>
                  <span>First name</span>
                  <Input name="firstName" required />
                </label>
                <label>
                  <span>Last name</span>
                  <Input name="lastName" required />
                </label>
              </div>
              <label>
                <span>Email</span>
                <Input name="email" required type="email" />
              </label>
              <Select
                label="Role"
                name="roleId"
                options={roles.map((role) => ({ label: role.name, value: role.id }))}
                placeholder="Choose a role"
              />
              <div className="ui-dialog-actions">
                <Button variant="secondary" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Send invitation</Button>
              </div>
            </form>
          </Dialog>
        ) : null}
      </header>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {message ? <AuthMessage tone="success">{message}</AuthMessage> : null}
      {!users ? (
        <LoadingState label="Loading users" />
      ) : (
        <div className="table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Role</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>
                      {user.firstName} {user.lastName}
                    </strong>
                    {user.id === current.id ? <small>Current user</small> : null}
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <div className="invitation-status">
                      <Badge
                        tone={
                          user.status === 'ACTIVE'
                            ? 'success'
                            : user.status === 'INVITED'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {user.status}
                      </Badge>
                      {user.status === 'INVITED' && user.invitation ? (
                        <small>
                          Expires {new Date(user.invitation.expiresAt).toLocaleDateString()}
                        </small>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {user.status === 'INVITED'
                      ? (user.invitation?.role.name ?? 'Invitation unavailable')
                      : user.userRoles.map(({ role }) => role.name).join(', ') || 'Not assigned'}
                  </td>
                  <td>
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td>
                    <div className="table-actions">
                      {canUpdate && user.status !== 'INVITED' ? (
                        <Select
                          value={user.userRoles[0]?.role.id ?? null}
                          onValueChange={(roleId) => roleId && void update(user.id, { roleId })}
                          options={roles.map((role) => ({ label: role.name, value: role.id }))}
                          placeholder="Role"
                        />
                      ) : null}
                      {canUpdate && user.id !== current.id && user.status !== 'INVITED' ? (
                        <Select
                          value={user.status}
                          onValueChange={(status) => status && void update(user.id, { status })}
                          options={[
                            { label: 'Active', value: 'ACTIVE' },
                            { label: 'Suspended', value: 'SUSPENDED' },
                            { label: 'Disabled', value: 'DISABLED' },
                          ]}
                        />
                      ) : null}
                      {canInvite && user.status === 'INVITED' ? (
                        <>
                          <Button
                            disabled={busyUserId === user.id}
                            onClick={() => void resendInvitation(user)}
                            variant="outline"
                          >
                            <RefreshCw size={14} /> Resend invitation
                          </Button>
                          <ConfirmationDialog
                            confirmLabel="Cancel invitation"
                            description={`The current invitation for ${user.email} will stop working.`}
                            onConfirm={() => void cancelInvitation(user)}
                            title="Cancel invitation?"
                            trigger={
                              <Button disabled={busyUserId === user.id} variant="ghost">
                                <XCircle size={14} /> Cancel invitation
                              </Button>
                            }
                          />
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
