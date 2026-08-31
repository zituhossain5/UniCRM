'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { Badge, Button, Checkbox, Dialog, Input, LoadingState, Textarea } from '@unicrm/ui';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

interface Permission {
  id: string;
  key: string;
  description: string;
}
interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  rolePermissions: Array<{ permission: Permission }>;
  _count: { userRoles: number };
}

export function RolesSettings() {
  const user = useCurrentUser();
  const [roles, setRoles] = useState<Role[]>();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const canManage = user.permissions.includes('role.manage');
  const load = useCallback(async () => {
    try {
      const [roleResult, permissionResult] = await Promise.all([
        apiRequest<{ data: Role[] }>('/roles'),
        apiRequest<{ data: Permission[] }>('/permissions'),
      ]);
      setRoles(roleResult.data);
      setPermissions(permissionResult.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load roles.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest('/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          description: data.get('description'),
          permissionKeys: selected,
        }),
      });
      setOpen(false);
      setSelected([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Role creation failed.');
    }
  }
  return (
    <section className="settings-section settings-section--wide">
      <header className="settings-section-header">
        <div>
          <h2>Roles & Permissions</h2>
          <p>Roles are presets; permissions are enforced by the API.</p>
        </div>
        {canManage ? (
          <Dialog
            description="Create a focused permission preset for this organization."
            onOpenChange={setOpen}
            open={open}
            title="Create role"
            trigger={
              <Button>
                <Plus size={15} />
                Create role
              </Button>
            }
          >
            <form className="dialog-form" onSubmit={(event) => void create(event)}>
              <label>
                <span>Name</span>
                <Input name="name" required />
              </label>
              <label>
                <span>Description</span>
                <Textarea name="description" />
              </label>
              <fieldset className="permission-picker">
                <legend>Permissions</legend>
                {permissions.map((permission) => (
                  <Checkbox
                    checked={selected.includes(permission.key)}
                    key={permission.key}
                    label={
                      <span>
                        <strong>{permission.key}</strong>
                        <small>{permission.description}</small>
                      </span>
                    }
                    onCheckedChange={(checked) =>
                      setSelected((values) =>
                        checked
                          ? [...values, permission.key]
                          : values.filter((value) => value !== permission.key),
                      )
                    }
                  />
                ))}
              </fieldset>
              <div className="ui-dialog-actions">
                <Button onClick={() => setOpen(false)} variant="secondary">
                  Cancel
                </Button>
                <Button type="submit">Create role</Button>
              </div>
            </form>
          </Dialog>
        ) : null}
      </header>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {!roles ? (
        <LoadingState label="Loading roles" />
      ) : (
        <div className="role-list">
          {roles.map((role) => (
            <article className="role-row" key={role.id}>
              <div>
                <div className="role-title">
                  <strong>{role.name}</strong>
                  {role.isSystem ? <Badge>Default</Badge> : null}
                </div>
                <p>{role.description ?? `${role.rolePermissions.length} permissions`}</p>
              </div>
              <div className="role-summary">
                <span>{role._count.userRoles} users</span>
                <span>{role.rolePermissions.length} permissions</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
