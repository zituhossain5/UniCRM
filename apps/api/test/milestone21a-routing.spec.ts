import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configuredApiBaseUrl, configuredApiUrl } from '../../web/src/lib/api-url';
import { runtimeModeFromPath } from '../../web/src/lib/runtime';

describe('Milestone 21A demo API routing', () => {
  const localUrls = {
    normal: 'http://localhost:4000/api/v1',
    demo: 'http://localhost:4500/api/v1',
  };
  const productionUrls = { normal: '/api/v1', demo: '/demo-api/v1' };

  it('resolves local normal and demo APIs without using the edge prefix locally', () => {
    expect(configuredApiBaseUrl('NORMAL', localUrls)).toBe('http://localhost:4000/api/v1');
    expect(configuredApiBaseUrl('DEMO', localUrls)).toBe('http://localhost:4500/api/v1');
    expect(configuredApiUrl('DEMO', '/demo/start', localUrls)).toBe(
      'http://localhost:4500/api/v1/demo/start',
    );
  });

  it('preserves the production normal and Traefik demo prefixes', () => {
    expect(configuredApiBaseUrl('NORMAL', productionUrls)).toBe('/api/v1');
    expect(configuredApiBaseUrl('DEMO', productionUrls)).toBe('/demo-api/v1');
    expect(configuredApiUrl('DEMO', '/demo/start', productionUrls)).toBe('/demo-api/v1/demo/start');
  });

  it('keeps demo and normal runtimes pinned to their configured API', () => {
    expect(runtimeModeFromPath('/demo/app/leads')).toBe('DEMO');
    expect(configuredApiUrl('DEMO', '/leads', localUrls)).toContain('localhost:4500');
    expect(configuredApiUrl('DEMO', '/leads', localUrls)).not.toContain('localhost:4000');

    expect(runtimeModeFromPath('/app/leads')).toBe('NORMAL');
    expect(configuredApiUrl('NORMAL', '/leads', localUrls)).toContain('localhost:4000');
    expect(configuredApiUrl('NORMAL', '/leads', localUrls)).not.toContain('localhost:4500');
  });

  it('fails closed when the demo API is not configured', () => {
    expect(() => configuredApiBaseUrl('DEMO', { normal: '/api/v1' })).toThrow(
      'NEXT_PUBLIC_DEMO_API_URL is required for demo mode',
    );
  });

  it('builds the demo start URL with exactly one API prefix', () => {
    const local = configuredApiUrl('DEMO', 'demo/start', localUrls);
    const production = configuredApiUrl('DEMO', 'demo/start', productionUrls);
    expect(local.match(/\/api\/v1/g)).toHaveLength(1);
    expect(production).toBe('/demo-api/v1/demo/start');
    expect(production).not.toContain('/api/v1/api/v1');
  });

  it('keeps the canonical Nest route at /api/v1/demo/start', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
    const controller = readFileSync(resolve(process.cwd(), 'src/demo/demo.controller.ts'), 'utf8');
    expect(main).toContain("setGlobalPrefix('api/v1')");
    expect(controller).toContain("@Controller('demo')");
    expect(controller).toContain("@Post('start')");
    expect(controller).not.toContain('demo-api');
  });

  it('routes Explore Live Demo through the centralized demo API helper', () => {
    const login = readFileSync(
      resolve(process.cwd(), '../web/src/components/login-form.tsx'),
      'utf8',
    );
    expect(login).toContain("apiUrlForRuntime('DEMO', '/demo/start')");
    expect(login).not.toContain("fetch('/api/v1/demo/start");
    expect(login).not.toContain("fetch('/demo-api/v1/demo/start");
  });

  it('preserves the explicit Traefik rewrite and route priority', () => {
    const compose = readFileSync(
      resolve(process.cwd(), '../../docker-compose.traefik.example.yml'),
      'utf8',
    );
    expect(compose).toContain('PathPrefix(`/demo-api/v1`)');
    expect(compose).toContain('unicrm-demo-api.priority=300');
    expect(compose).toContain('replacepathregex.replacement=/api/$${1}');
    expect(compose).toContain('PathPrefix(`/api/v1`)');
    expect(compose).toContain('unicrm-api.priority=200');
  });
});
