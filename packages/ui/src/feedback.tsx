'use client';

import { Toast as BaseToast } from '@base-ui/react/toast';
import { AlertCircle, CheckCircle2, Inbox, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './primitives';

export function EmptyState({
  action,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="ui-state">
      <div className="ui-state-icon">{icon ?? <Inbox size={20} />}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  action,
  description,
  title = 'Something went wrong',
}: {
  action?: ReactNode;
  description: ReactNode;
  title?: ReactNode;
}) {
  return (
    <div className="ui-state ui-state--error">
      <div className="ui-state-icon">
        <AlertCircle size={20} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`ui-skeleton ${className}`} />;
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="ui-loading-state">
      <Skeleton className="ui-skeleton-title" />
      <Skeleton />
      <Skeleton />
      <Skeleton className="ui-skeleton-short" />
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider timeout={5000}>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className="ui-toast-viewport">
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((toast) => (
    <BaseToast.Root className="ui-toast" key={toast.id} toast={toast}>
      <CheckCircle2 aria-hidden="true" className="ui-toast-icon" size={18} />
      <BaseToast.Content className="ui-toast-content">
        <BaseToast.Title className="ui-toast-title" />
        <BaseToast.Description className="ui-toast-description" />
      </BaseToast.Content>
      <BaseToast.Close
        render={
          <IconButton label="Dismiss notification" size="sm">
            <X size={15} />
          </IconButton>
        }
      />
    </BaseToast.Root>
  ));
}

export function ToastDemoButton({ children }: { children: ReactNode }) {
  const manager = BaseToast.useToastManager();
  return (
    <button
      className="ui-button ui-button--outline"
      onClick={() =>
        manager.add({
          description: 'The notification system is ready for application events.',
          title: 'Toast created',
        })
      }
      type="button"
    >
      {children}
    </button>
  );
}
