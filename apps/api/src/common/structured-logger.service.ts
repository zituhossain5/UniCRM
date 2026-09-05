import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/environment';

type LogLevel = 'debug' | 'error' | 'log' | 'verbose' | 'warn';

@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly json: boolean;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.json = config.get('LOG_FORMAT', { infer: true }) === 'json';
  }

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(level: LogLevel, message: unknown, context?: string, trace?: string): void {
    if (!this.json) {
      const prefix = context ? `[${context}] ` : '';
      const rendered = `${prefix}${String(message)}`;
      if (level === 'error') console.error(rendered, trace ?? '');
      else if (level === 'warn') console.warn(rendered);
      else console.log(rendered);
      return;
    }

    const payload: Record<string, unknown> = {
      context,
      level: level === 'log' ? 'info' : level,
      message: String(message),
      timestamp: new Date().toISOString(),
    };
    if (trace) payload.trace = trace;
    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line);
    else console.log(line);
  }
}
