import { describe, expect, it } from 'vitest';
import { composeWebToLeadEndpointUrl } from '../../web/src/lib/web-to-lead-url';

describe('Web-to-Lead endpoint URL composition', () => {
  it('uses the API response path without duplicating the API prefix', () => {
    const endpoint = composeWebToLeadEndpointUrl(
      'https://crm.unicodeit.com/api/v1',
      '/api/v1/inbound/web-to-lead/integration-id',
    );

    expect(endpoint).toBe('https://crm.unicodeit.com/api/v1/inbound/web-to-lead/integration-id');
    expect(endpoint).not.toContain('/api/v1/api/v1/');
  });
});
