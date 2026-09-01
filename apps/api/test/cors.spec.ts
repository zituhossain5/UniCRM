import { describe, expect, it } from 'vitest';
import { allowedCorsOrigins } from '../src/config/cors';

describe('allowedCorsOrigins', () => {
  it('allows both IPv4 loopback hostnames in development', () => {
    expect(allowedCorsOrigins('http://localhost:3001', 'development')).toEqual([
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ]);
    expect(allowedCorsOrigins('http://127.0.0.1:3001', 'development')).toEqual([
      'http://127.0.0.1:3001',
      'http://localhost:3001',
    ]);
  });

  it('does not expand configured origins outside development', () => {
    expect(
      allowedCorsOrigins('https://crm.example.com,http://localhost:3001', 'production'),
    ).toEqual(['https://crm.example.com', 'http://localhost:3001']);
  });
});
