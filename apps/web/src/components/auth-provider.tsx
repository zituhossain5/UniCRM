'use client';

import type { CurrentUser } from '@/lib/auth-types';
import { createContext, useContext, type ReactNode } from 'react';

const AuthContext = createContext<CurrentUser | null>(null);

export function AuthProvider({ children, user }: { children: ReactNode; user: CurrentUser }) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useCurrentUser(): CurrentUser {
  const user = useContext(AuthContext);
  if (!user) throw new Error('useCurrentUser must be used inside AuthProvider');
  return user;
}
