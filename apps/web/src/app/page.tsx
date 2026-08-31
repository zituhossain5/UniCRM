import { getHealth } from '@/lib/health';

interface StatusItem {
  label: string;
  state: 'Connected' | 'Running' | 'Unavailable';
}

export default async function HomePage() {
  const health = await getHealth();
  const statuses: StatusItem[] = [
    { label: 'Web', state: 'Running' },
    { label: 'API', state: health ? 'Connected' : 'Unavailable' },
    {
      label: 'Database',
      state: health?.services.database === 'connected' ? 'Connected' : 'Unavailable',
    },
    {
      label: 'Redis',
      state: health?.services.redis === 'connected' ? 'Connected' : 'Unavailable',
    },
  ];

  return (
    <main className="status-shell">
      <section className="status-panel" aria-labelledby="status-title">
        <div className="brand-mark" aria-hidden="true">
          U
        </div>
        <div className="heading-group">
          <p className="eyebrow">UnicodeIT</p>
          <h1 id="status-title">UniCRM</h1>
          <p className="subtitle">Development environment status</p>
        </div>

        <dl className="status-list">
          {statuses.map((item) => {
            const isAvailable = item.state !== 'Unavailable';

            return (
              <div className="status-row" key={item.label}>
                <dt>{item.label}</dt>
                <dd className={isAvailable ? 'status-ok' : 'status-error'}>
                  <span className="status-dot" aria-hidden="true" />
                  {item.state}
                </dd>
              </div>
            );
          })}
        </dl>

        <p className="status-note">
          {health
            ? `Last API check ${new Date(health.timestamp).toLocaleTimeString('en', {
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : 'Start the API and infrastructure to complete the connection check.'}
        </p>
      </section>
    </main>
  );
}
