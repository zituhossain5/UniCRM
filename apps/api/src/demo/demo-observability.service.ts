import { Injectable, Logger } from '@nestjs/common';

export type DemoEvent =
  | 'demo_started'
  | 'demo_start_rejected'
  | 'demo_rate_limited'
  | 'demo_expired'
  | 'demo_cleanup_started'
  | 'demo_cleanup_completed'
  | 'demo_cleanup_failed'
  | 'demo_blocked_action'
  | 'demo_simulated_email'
  | 'demo_simulated_webhook';

type SafeMetadata = Record<string, boolean | number | string | null | undefined>;

@Injectable()
export class DemoObservabilityService {
  private readonly logger = new Logger(DemoObservabilityService.name);
  private readonly counters = new Map<DemoEvent, number>();

  record(event: DemoEvent, metadata: SafeMetadata = {}, level: 'log' | 'warn' = 'log'): void {
    this.counters.set(event, (this.counters.get(event) ?? 0) + 1);
    this.logger[level](JSON.stringify({ event, ...metadata }));
  }

  /** Internal-only snapshot for tests/operations wiring; intentionally has no public controller. */
  snapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.counters.entries());
  }
}
