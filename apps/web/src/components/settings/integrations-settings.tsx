'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type {
  IntegrationConnection,
  IntegrationEventRecord,
  WebhookDeliveryRecord,
  WebhookSubscription,
} from '@/lib/integration-types';
import { Button, Input, LoadingState, Select } from '@unicrm/ui';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

const eventTypes = [
  'lead.created',
  'lead.updated',
  'lead.stage_changed',
  'lead.owner_changed',
  'company.created',
  'company.updated',
  'contact.created',
  'contact.updated',
  'project.created',
  'project.updated',
  'project.status_changed',
  'task.created',
  'task.updated',
  'task.completed',
  'task.status_changed',
  'task.overdue',
  'quotation.created',
  'quotation.status_changed',
  'payment.created',
];

type Tab = 'connections' | 'inbound' | 'outbound' | 'logs';

export function IntegrationsSettings() {
  const current = useCurrentUser();
  const [tab, setTab] = useState<Tab>('connections');
  const [connections, setConnections] = useState<IntegrationConnection[]>();
  const [subscriptions, setSubscriptions] = useState<WebhookSubscription[]>([]);
  const [events, setEvents] = useState<IntegrationEventRecord[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRecord[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [connectionSecret, setConnectionSecret] = useState('');
  const [direction, setDirection] = useState('BOTH');
  const [subscriptionName, setSubscriptionName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [subscriptionSecret, setSubscriptionSecret] = useState('');
  const [subscriptionConnection, setSubscriptionConnection] = useState('');
  const [subscriptionEvent, setSubscriptionEvent] = useState('lead.created');
  const canManage = current.permissions.includes('integration.manage');
  const canManageWebhooks = current.permissions.includes('webhook.manage');
  const canReadLogs = current.permissions.includes('integration.logs.read');
  const canRetry = current.permissions.includes('integration.retry');

  async function load() {
    setError('');
    try {
      const connectionResponse = await apiRequest<{ data: IntegrationConnection[] }>(
        '/integrations/connections',
      );
      setConnections(connectionResponse.data);
      setSubscriptionConnection((value) => value || connectionResponse.data[0]?.id || '');
      if (canReadLogs) {
        const [eventResponse, deliveryResponse] = await Promise.all([
          apiRequest<{ data: IntegrationEventRecord[] }>('/integrations/events'),
          apiRequest<{ data: WebhookDeliveryRecord[] }>('/integrations/deliveries'),
        ]);
        setEvents(eventResponse.data);
        setDeliveries(deliveryResponse.data);
      }
      setSubscriptions(
        (await apiRequest<{ data: WebhookSubscription[] }>('/integrations/subscriptions')).data,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load integrations.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createConnection() {
    setError('');
    setMessage('');
    try {
      await apiRequest('/integrations/connections', {
        method: 'POST',
        body: JSON.stringify({
          name: connectionName,
          provider: 'CUSTOM',
          direction,
          secret: connectionSecret,
        }),
      });
      setConnectionName('');
      setConnectionSecret('');
      setMessage('Integration connection created.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create connection.');
    }
  }

  async function createSubscription() {
    setError('');
    setMessage('');
    try {
      await apiRequest('/integrations/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          name: subscriptionName,
          connectionId: subscriptionConnection,
          targetUrl,
          secret: subscriptionSecret,
          eventTypes: [subscriptionEvent],
        }),
      });
      setSubscriptionName('');
      setTargetUrl('');
      setSubscriptionSecret('');
      setMessage('Outbound webhook created.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create webhook.');
    }
  }

  async function retry(kind: 'events' | 'deliveries', id: string) {
    setError('');
    setMessage('');
    try {
      await apiRequest(`/integrations/${kind}/${id}/retry`, { method: 'POST' });
      setMessage('Retry queued.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not queue retry.');
    }
  }

  if (!connections && !error) return <LoadingState label="Loading integrations" />;

  return (
    <section className="settings-section settings-section--wide">
      <header className="settings-section-header">
        <div>
          <h2>Integrations</h2>
          <p>Secure generic connections and signed webhook delivery.</p>
        </div>
      </header>
      <nav aria-label="Integration sections" className="settings-tabs">
        {(['connections', 'inbound', 'outbound', 'logs'] as Tab[]).map((value) => (
          <button
            aria-current={tab === value ? 'page' : undefined}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {value[0]!.toUpperCase() + value.slice(1)}
          </button>
        ))}
      </nav>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {message ? <AuthMessage>{message}</AuthMessage> : null}

      {tab === 'connections' ? (
        <div className="configuration-list">
          {canManage ? (
            <div className="configuration-row configuration-row--stacked">
              <strong>New connection</strong>
              <Input
                aria-label="Connection name"
                placeholder="Connection name"
                value={connectionName}
                onChange={(event) => setConnectionName(event.target.value)}
              />
              <Select
                label="Direction"
                value={direction}
                onValueChange={(value) => value && setDirection(value)}
                options={['INBOUND', 'OUTBOUND', 'BOTH'].map((value) => ({ label: value, value }))}
              />
              <Input
                aria-label="Shared secret"
                placeholder="Shared secret"
                type="password"
                value={connectionSecret}
                onChange={(event) => setConnectionSecret(event.target.value)}
              />
              <small>
                Use at least 32 random characters. The secret is encrypted and will not be shown
                again.
              </small>
              <Button
                disabled={!connectionName || connectionSecret.length < 32}
                onClick={() => void createConnection()}
                type="button"
              >
                Create connection
              </Button>
            </div>
          ) : null}
          {connections?.map((connection) => (
            <div className="configuration-row" key={connection.id}>
              <div>
                <strong>{connection.name}</strong>
                <small>
                  {connection.provider} · {connection.direction} · secret ending{' '}
                  {connection.secretLastFour}
                </small>
              </div>
              <span>{connection.status}</span>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'inbound' ? (
        <div className="configuration-list">
          {connections
            ?.filter((connection) => connection.direction !== 'OUTBOUND')
            .map((connection) => (
              <div className="configuration-row configuration-row--stacked" key={connection.id}>
                <strong>{connection.name}</strong>
                <small>POST /api/v1/integrations/webhooks/{connection.id}</small>
                <small>
                  Required headers: X-UniCRM-Event, X-UniCRM-Delivery, X-UniCRM-Timestamp,
                  X-UniCRM-Signature
                </small>
              </div>
            ))}
        </div>
      ) : null}

      {tab === 'outbound' ? (
        <div className="configuration-list">
          {canManageWebhooks ? (
            <div className="configuration-row configuration-row--stacked">
              <strong>New outbound webhook</strong>
              <Input
                aria-label="Webhook name"
                placeholder="Webhook name"
                value={subscriptionName}
                onChange={(event) => setSubscriptionName(event.target.value)}
              />
              <Select
                label="Connection"
                value={subscriptionConnection}
                onValueChange={(value) => value && setSubscriptionConnection(value)}
                options={(connections ?? [])
                  .filter((connection) => connection.direction !== 'INBOUND')
                  .map((connection) => ({ label: connection.name, value: connection.id }))}
              />
              <Input
                aria-label="HTTPS target URL"
                placeholder="HTTPS target URL"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
              />
              <Select
                label="Event"
                value={subscriptionEvent}
                onValueChange={(value) => value && setSubscriptionEvent(value)}
                options={eventTypes.map((value) => ({ label: value, value }))}
              />
              <Input
                aria-label="Signing secret"
                placeholder="Signing secret"
                type="password"
                value={subscriptionSecret}
                onChange={(event) => setSubscriptionSecret(event.target.value)}
              />
              <Button
                disabled={
                  !subscriptionName || !subscriptionConnection || subscriptionSecret.length < 32
                }
                onClick={() => void createSubscription()}
                type="button"
              >
                Create webhook
              </Button>
            </div>
          ) : null}
          {subscriptions.map((subscription) => (
            <div className="configuration-row" key={subscription.id}>
              <div>
                <strong>{subscription.name}</strong>
                <small>
                  {subscription.targetUrl} · {subscription.eventTypes.join(', ')}
                </small>
              </div>
              <span>{subscription.active ? 'ACTIVE' : 'DISABLED'}</span>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'logs' && canReadLogs ? (
        <div className="configuration-list">
          <div className="configuration-row configuration-row--stacked">
            <strong>Integration events</strong>
            <LogTable
              records={events.map((event) => ({ ...event, attempts: event.attemptCount }))}
              canRetry={canRetry}
              onRetry={(id) => retry('events', id)}
            />
          </div>
          <div className="configuration-row configuration-row--stacked">
            <strong>Webhook deliveries</strong>
            <LogTable
              records={deliveries.map((delivery) => ({ ...delivery, attempts: delivery.attempt }))}
              canRetry={canRetry}
              onRetry={(id) => retry('deliveries', id)}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LogTable({
  records,
  canRetry,
  onRetry,
}: {
  records: Array<{
    id: string;
    eventType: string;
    status: string;
    attempts: number;
    retryable: boolean;
    lastError: string | null;
    createdAt: string;
  }>;
  canRetry: boolean;
  onRetry: (id: string) => Promise<void>;
}) {
  return (
    <table className="settings-table">
      <thead>
        <tr>
          <th>Event</th>
          <th>Status</th>
          <th>Created</th>
          <th>Attempts</th>
          <th>Last error</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {records.map((record) => (
          <tr key={record.id}>
            <td>{record.eventType}</td>
            <td>{record.status}</td>
            <td>{new Date(record.createdAt).toLocaleString()}</td>
            <td>{record.attempts}</td>
            <td>{record.lastError ?? '—'}</td>
            <td>
              {canRetry && record.status === 'FAILED' && record.retryable ? (
                <Button
                  aria-label={`Retry ${record.eventType}`}
                  onClick={() => void onRetry(record.id)}
                  type="button"
                  variant="secondary"
                >
                  <RotateCcw size={14} />
                </Button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
