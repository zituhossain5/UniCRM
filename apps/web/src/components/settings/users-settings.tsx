'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { Badge, Button, Dialog, Input, LoadingState, Select } from '@unicrm/ui';
import { UserPlus } from 'lucide-react';
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
}

export function UsersSettings() {
  const current = useCurrentUser();
  const [users, setUsers] = useState<UserRecord[]>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState('');
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
  }, [load]);

  async function update(userId: string, data: { roleId?: string; status?: string }) {
    try {
      await apiRequest(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'User update failed.');
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest('/users/invitations', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(data)),
      });
      setInviteOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invitation failed.');
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
                  </td>
                  <td>
                    {user.userRoles.map(({ role }) => role.name).join(', ') || 'Not assigned'}
                  </td>
                  <td>
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td>
                    <div className="table-actions">
                      {canUpdate ? (
                        <Select
                          value={user.userRoles[0]?.role.id ?? null}
                          onValueChange={(roleId) => roleId && void update(user.id, { roleId })}
                          options={roles.map((role) => ({ label: role.name, value: role.id }))}
                          placeholder="Role"
                        />
                      ) : null}
                      {canUpdate && user.id !== current.id ? (
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
