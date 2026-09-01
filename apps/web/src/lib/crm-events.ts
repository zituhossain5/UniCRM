'use client';

export type CrmDataKey = 'companies' | 'contacts' | 'leads';

export const CRM_DATA_CHANGED_EVENT = 'unicrm:crm-data-changed';

export function emitCrmDataChanged(keys: CrmDataKey[]) {
  window.dispatchEvent(new CustomEvent(CRM_DATA_CHANGED_EVENT, { detail: { keys } }));
}

export function onCrmDataChanged(keys: CrmDataKey[], callback: () => void) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ keys?: CrmDataKey[] }>).detail;
    if (!detail?.keys?.some((key) => keys.includes(key))) return;
    callback();
  };
  window.addEventListener(CRM_DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CRM_DATA_CHANGED_EVENT, listener);
}
