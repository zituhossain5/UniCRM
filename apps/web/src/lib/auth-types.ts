export interface CurrentUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  roles: string[];
  permissions: string[];
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    defaultCurrency: string;
  };
}

export interface SessionRecord {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}
