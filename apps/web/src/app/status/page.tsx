import { getHealth } from '@/lib/health';
import Link from 'next/link';

export default async function StatusPage() {
  const health = await getHealth();
  const statuses = [
    { label: 'Web', available: true },
    { label: 'API', available: Boolean(health) },
    { label: 'Database', available: health?.services.database === 'connected' },
    { label: 'Redis', available: health?.services.redis === 'connected' },
  ];
  return (
    <main className="status-shell">
      <section className="status-panel">
        <div className="brand-symbol">U</div>
        <div>
          <p className="eyebrow">Development</p>
          <h1>System status</h1>
          <p className="muted-copy">Live connectivity for the local UniCRM foundation.</p>
        </div>
        <dl className="status-list">
          {statuses.map((item) => (
            <div className="status-row" key={item.label}>
              <dt>{item.label}</dt>
              <dd className={item.available ? 'status-ok' : 'status-error'}>
                <span className="status-dot" />
                {item.available ? 'Connected' : 'Unavailable'}
              </dd>
            </div>
          ))}
        </dl>
        <Link className="text-link" href="/app/dashboard">
          Return to UniCRM
        </Link>
      </section>
    </main>
  );
}
