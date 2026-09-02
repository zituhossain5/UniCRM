'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from './api';
import { onCrmDataChanged } from './crm-events';
import type { CompanyRecord, PersonRef } from './crm-types';
import type { ProjectRecord } from './work-types';

export function useWorkReferenceData() {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [users, setUsers] = useState<PersonRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [companyResult, projectResult, userResult] = await Promise.all([
        apiRequest<{ data: CompanyRecord[] }>('/companies?limit=100&sort=name&order=asc'),
        apiRequest<{ data: ProjectRecord[] }>('/projects?limit=100&sort=name&order=asc'),
        apiRequest<{ data: PersonRef[] }>('/projects/reference/users'),
      ]);
      setCompanies(companyResult.data);
      setProjects(projectResult.data);
      setUsers(userResult.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load project options.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const unsubscribe = onCrmDataChanged(['companies', 'projects', 'users'], () => void load());
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
  return { companies, projects, users, loading, error, reload: load };
}
