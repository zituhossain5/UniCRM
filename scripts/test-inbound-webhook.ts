import { createHmac } from 'node:crypto';

interface Options {
  eventId: string;
  eventType: string;
  invalidSignature: boolean;
  secret: string;
  url: string;
}

function usage(): string {
  return [
    'Usage:',
    '  pnpm test:webhook -- --url <webhook-url> --secret <connection-secret>',
    '    [--event-id <id>] [--event-type <type>] [--invalid-signature]',
  ].join('\n');
}

function readValue(arguments_: string[], index: number, name: string): string {
  const value = arguments_[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function parseArguments(arguments_: string[]): Options {
  let url = '';
  let secret = '';
  let eventId = 'evt_demo_001';
  let eventType = 'customer.created';
  let invalidSignature = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (argument === '--invalid-signature') {
      invalidSignature = true;
      continue;
    }
    const [name, inlineValue] = argument.split('=', 2);
    if (!['--url', '--secret', '--event-id', '--event-type'].includes(name!))
      throw new Error(`Unknown argument: ${argument}`);
    const value = inlineValue ?? readValue(arguments_, index, name!);
    if (inlineValue === undefined) index += 1;
    if (name === '--url') url = value;
    if (name === '--secret') secret = value;
    if (name === '--event-id') eventId = value;
    if (name === '--event-type') eventType = value;
  }

  if (!url) throw new Error('--url is required');
  if (!secret) throw new Error('--secret is required');
  if (secret.length < 32) throw new Error('--secret must contain at least 32 characters');
  if (!eventId || eventId.length > 160) throw new Error('--event-id must contain 1–160 characters');
  if (!/^[a-z][a-z0-9_.-]{0,119}$/.test(eventType))
    throw new Error('--event-type must match the UniCRM inbound event format');

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('--url must be a valid HTTP or HTTPS URL');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol))
    throw new Error('--url must use HTTP or HTTPS');

  return { eventId, eventType, invalidSignature, secret, url: parsedUrl.toString() };
}

function invalidated(signature: string): string {
  const first = signature[0] === '0' ? '1' : '0';
  return `${first}${signature.slice(1)}`;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const payload = {
    eventId: options.eventId,
    eventType: options.eventType,
    occurredAt: new Date().toISOString(),
    data: {
      externalCustomerId: 'CUS-DEMO-001',
      name: 'Demo Customer',
      email: 'demo@example.com',
    },
  };

  // Serialize exactly once. These exact UTF-8 bytes are both signed and sent.
  const rawBody = JSON.stringify(payload);
  const rawBodyBytes = Buffer.from(rawBody, 'utf8');
  const validHexSignature = createHmac('sha256', options.secret).update(rawBodyBytes).digest('hex');
  const hexSignature = options.invalidSignature
    ? invalidated(validHexSignature)
    : validHexSignature;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const response = await fetch(options.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-UniCRM-Event': options.eventType,
      'X-UniCRM-Delivery': options.eventId,
      'X-UniCRM-Timestamp': timestamp,
      'X-UniCRM-Signature': `sha256=${hexSignature}`,
    },
    body: rawBodyBytes,
    redirect: 'error',
  });
  const responseBody = (await response.text()).slice(0, 4_000);

  console.log(`HTTP ${response.status} ${response.statusText}`);
  if (responseBody) console.log(responseBody);

  if (options.invalidSignature) {
    if (response.status !== 401) {
      throw new Error(`Expected HTTP 401 for an invalid signature, received ${response.status}`);
    }
    console.log('Invalid signature was rejected as expected.');
    return;
  }

  if (!response.ok) throw new Error(`Webhook request failed with HTTP ${response.status}`);
  console.log('Inbound webhook was accepted.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Webhook test failed');
  console.error(usage());
  process.exitCode = 1;
});
