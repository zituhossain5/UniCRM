export const PUBLIC_ROUTE = 'unicrm:public-route';
export const REQUIRED_PERMISSIONS = 'unicrm:required-permissions';

export const PERMISSIONS = {
  roleManage: 'role.manage',
  roleRead: 'role.read',
  securitySessionsRead: 'security.sessions.read',
  securitySessionsRevoke: 'security.sessions.revoke',
  settingsRead: 'settings.read',
  settingsUpdate: 'settings.update',
  userDisable: 'user.disable',
  userInvite: 'user.invite',
  userRead: 'user.read',
  userUpdate: 'user.update',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: ReadonlyArray<{ key: PermissionKey; description: string }> = [
  { key: PERMISSIONS.userRead, description: 'View organization users' },
  { key: PERMISSIONS.userInvite, description: 'Invite organization users' },
  { key: PERMISSIONS.userUpdate, description: 'Update organization users' },
  { key: PERMISSIONS.userDisable, description: 'Suspend or disable organization users' },
  { key: PERMISSIONS.roleRead, description: 'View roles and permissions' },
  { key: PERMISSIONS.roleManage, description: 'Create and update roles' },
  { key: PERMISSIONS.settingsRead, description: 'View organization settings' },
  { key: PERMISSIONS.settingsUpdate, description: 'Update organization settings' },
  { key: PERMISSIONS.securitySessionsRead, description: 'View personal sessions' },
  { key: PERMISSIONS.securitySessionsRevoke, description: 'Revoke personal sessions' },
];

export const DEFAULT_ROLES = ['Owner', 'Admin', 'Manager', 'Staff', 'Viewer'] as const;

export const DEFAULT_ROLE_PERMISSIONS: Record<(typeof DEFAULT_ROLES)[number], PermissionKey[]> = {
  Owner: PERMISSION_CATALOG.map(({ key }) => key),
  Admin: PERMISSION_CATALOG.map(({ key }) => key),
  Manager: [
    PERMISSIONS.userRead,
    PERMISSIONS.roleRead,
    PERMISSIONS.settingsRead,
    PERMISSIONS.securitySessionsRead,
    PERMISSIONS.securitySessionsRevoke,
  ],
  Staff: [
    PERMISSIONS.settingsRead,
    PERMISSIONS.securitySessionsRead,
    PERMISSIONS.securitySessionsRevoke,
  ],
  Viewer: [
    PERMISSIONS.settingsRead,
    PERMISSIONS.securitySessionsRead,
    PERMISSIONS.securitySessionsRevoke,
  ],
};
