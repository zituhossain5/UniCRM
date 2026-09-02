'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from './api';
import {
  personName,
  type CompanyRecord,
  type ContactRecord,
  type PersonRef,
  type Pipeline,
} from './crm-types';
import { CRM_DATA_CHANGED_EVENT, type CrmDataKey } from './crm-events';

type ReferenceKey = 'companies' | 'contacts' | 'pipelines' | 'users';

interface ReferenceData {
  companies: CompanyRecord[];
  contacts: ContactRecord[];
  pipelines: Pipeline[];
  users: PersonRef[];
}

const cache: Partial<ReferenceData> = {};
const inflight: Partial<Record<ReferenceKey, Promise<ReferenceData[ReferenceKey]>>> = {};

const loaders = {
  companies: () =>
    apiRequest<{ data: CompanyRecord[] }>('/companies?limit=100&sort=name&order=asc').then(
      (result) => result.data,
    ),
  contacts: () =>
    apiRequest<{ data: ContactRecord[] }>('/contacts?limit=100&sort=lastName&order=asc').then(
      (result) => result.data,
    ),
  pipelines: () => apiRequest<{ data: Pipeline[] }>('/pipelines').then((result) => result.data),
  users: () =>
    apiRequest<{ data: PersonRef[] }>('/users').then((result) =>
      result.data.filter((user) => user.status === 'ACTIVE'),
    ),
} satisfies { [K in ReferenceKey]: () => Promise<ReferenceData[K]> };

const invalidatedReferences: Record<CrmDataKey, ReferenceKey[]> = {
  companies: ['companies'],
  contacts: ['contacts'],
  leads: [],
  projects: [],
  tasks: [],
  users: ['users'],
};

async function loadReference<K extends ReferenceKey>(key: K, refresh = false) {
  if (!refresh && cache[key]) return cache[key];
  if (!refresh && inflight[key]) return inflight[key] as Promise<ReferenceData[K]>;

  const request = loaders[key]().then((data) => {
    cache[key] = data as never;
    delete inflight[key];
    return data;
  });
  inflight[key] = request;
  return request;
}

export function invalidateCrmReferenceData(keys: CrmDataKey[]) {
  for (const dataKey of keys) {
    for (const referenceKey of invalidatedReferences[dataKey]) {
      delete cache[referenceKey];
      delete inflight[referenceKey];
    }
  }
}

export function useCrmReferenceData({
  companies = false,
  contacts = false,
  pipelines = false,
  users = false,
}: Partial<Record<ReferenceKey, boolean>>) {
  const requested = useMemo(
    () =>
      [
        companies ? 'companies' : null,
        contacts ? 'contacts' : null,
        pipelines ? 'pipelines' : null,
        users ? 'users' : null,
      ].filter(Boolean) as ReferenceKey[],
    [companies, contacts, pipelines, users],
  );
  const [data, setData] = useState<ReferenceData>({
    companies: cache.companies ?? [],
    contacts: cache.contacts ?? [],
    pipelines: cache.pipelines ?? [],
    users: cache.users ?? [],
  });
  const [loading, setLoading] = useState(requested.some((key) => !cache[key]));
  const [error, setError] = useState('');

  const reload = useCallback(
    async (refresh = false) => {
      if (!requested.length) return;
      setLoading(true);
      setError('');
      try {
        const entries = await Promise.all(
          requested.map(async (key) => [key, await loadReference(key, refresh)] as const),
        );
        setData((current) => {
          const next = { ...current };
          for (const [key, value] of entries) next[key] = value as never;
          return next;
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load CRM reference data.');
      } finally {
        setLoading(false);
      }
    },
    [requested],
  );

  useEffect(() => {
    void reload(false);
  }, [reload]);

  useEffect(() => {
    const listener = (event: Event) => {
      const keys = (event as CustomEvent<{ keys?: CrmDataKey[] }>).detail?.keys ?? [];
      const shouldReload = keys.some((key) =>
        invalidatedReferences[key]?.some((referenceKey) => requested.includes(referenceKey)),
      );
      if (!shouldReload) return;
      invalidateCrmReferenceData(keys);
      void reload(true);
    };
    window.addEventListener(CRM_DATA_CHANGED_EVENT, listener);
    return () => window.removeEventListener(CRM_DATA_CHANGED_EVENT, listener);
  }, [reload, requested]);

  return { ...data, error, loading, reload };
}

export const userOptions = (users: PersonRef[]) =>
  users.map((user) => ({ label: personName(user), value: user.id }));
