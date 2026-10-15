# Web-to-Lead V1

Web-to-Lead accepts signed website form submissions and creates a new UniCRM Lead through the
existing integration queue. Configure integrations at **Settings → Integrations → Web-to-Lead**.
Each integration is organization-scoped and can define a default Lead pipeline, stage, owner,
priority, tags, and controlled field mappings.

## Security contract

Send JSON to:

```text
POST https://crm.example.com/api/v1/inbound/web-to-lead/{integrationId}
```

Required headers:

```text
Content-Type: application/json
X-UniCRM-Timestamp: 1792051200
X-UniCRM-Idempotency-Key: form-submission-unique-id
X-UniCRM-Signature: <lowercase hexadecimal HMAC>
```

The signature is:

```text
hex(HMAC-SHA256(secret, timestamp + "." + exactRawRequestBody))
```

Do not parse and re-serialize the body between signing and sending it. Production requests must use
HTTPS. Timestamps outside the configured tolerance, invalid signatures, oversized payloads, inactive
integrations, and unknown fields are rejected. Keep the secret on the server; never put it in browser
JavaScript, WordPress page content, or a public repository. Rotate a secret from UniCRM if it is
exposed. Rotation invalidates the old secret immediately.

The idempotency key and `submissionId` must each uniquely identify a form submission for this
integration. A retry using either same value is accepted without creating another Lead. A genuinely
new inquiry should use new values, including when the Contact or Company already exists.

## Payload

At least one of `email` or `phone` is required.

```json
{
  "submissionId": "site-form-01JAD1V8W4F4C5NA4Q0J7X41FH",
  "firstName": "Amina",
  "lastName": "Rahman",
  "fullName": "Amina Rahman",
  "email": "amina@example.com",
  "phone": "+8801700000000",
  "company": "Example Limited",
  "subject": "Website redesign",
  "message": "Please contact me about a redesign.",
  "service": "Web development",
  "estimatedValue": 250000,
  "priority": "HIGH",
  "custom": {
    "budget_type": "Fixed"
  }
}
```

`custom` accepts at most 50 bounded scalar or array values. A custom input only reaches a CRM custom
field when an administrator creates an explicit mapping. Unknown top-level payload properties are
rejected by the API.

Successful acceptance returns HTTP `202`:

```json
{
  "data": {
    "accepted": true,
    "submissionId": "site-form-01JAD1V8W4F4C5NA4Q0J7X41FH"
  }
}
```

Acceptance means the request passed authentication and was queued. Processing outcome and the linked
Lead are visible in the integration submission log.

## cURL

Because the signature covers exact bytes, generate the timestamp and signature in a shell with a
capable HMAC utility. This Bash example requires OpenSSL:

```bash
URL='https://crm.example.com/api/v1/inbound/web-to-lead/INTEGRATION_UUID'
SECRET='COPY_THE_ONE_TIME_SECRET'
TIMESTAMP="$(date +%s)"
IDEMPOTENCY_KEY="site-$(date +%s)-$RANDOM"
BODY='{"submissionId":"demo-001","fullName":"Demo Customer","email":"demo@example.com","subject":"Website inquiry"}'
SIGNATURE="$(printf '%s' "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')"
curl --fail-with-body "$URL" \
  -H 'Content-Type: application/json' \
  -H "X-UniCRM-Timestamp: $TIMESTAMP" \
  -H "X-UniCRM-Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "X-UniCRM-Signature: $SIGNATURE" \
  --data-binary "$BODY"
```

## Node.js

```js
import crypto from 'node:crypto';

const payload = {
  submissionId: crypto.randomUUID(),
  fullName: 'Demo Customer',
  email: 'demo@example.com',
  subject: 'Website inquiry',
};
const body = JSON.stringify(payload);
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = crypto
  .createHmac('sha256', process.env.UNICRM_WEB_TO_LEAD_SECRET)
  .update(`${timestamp}.${body}`)
  .digest('hex');

await fetch(process.env.UNICRM_WEB_TO_LEAD_URL, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-unicrm-timestamp': timestamp,
    'x-unicrm-idempotency-key': payload.submissionId,
    'x-unicrm-signature': signature,
  },
  body,
});
```

## Next.js route handler

Keep the secret in server-only environment variables and proxy a validated public form through a
route handler:

```ts
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const input = await request.json();
  const submissionId = crypto.randomUUID();
  const body = JSON.stringify({ submissionId, ...input });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac('sha256', process.env.UNICRM_WEB_TO_LEAD_SECRET!)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const response = await fetch(process.env.UNICRM_WEB_TO_LEAD_URL!, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-unicrm-timestamp': timestamp,
      'x-unicrm-idempotency-key': submissionId,
      'x-unicrm-signature': signature,
    },
    body,
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
```

## NestJS service

```ts
import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';

@Injectable()
export class UniCrmLeadGateway {
  async submit(input: Record<string, unknown>) {
    const submissionId = randomUUID();
    const body = JSON.stringify({ submissionId, ...input });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', process.env.UNICRM_WEB_TO_LEAD_SECRET!)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    return fetch(process.env.UNICRM_WEB_TO_LEAD_URL!, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-unicrm-timestamp': timestamp,
        'x-unicrm-idempotency-key': submissionId,
        'x-unicrm-signature': signature,
      },
      body,
    });
  }
}
```

## Python

```python
import hashlib, hmac, json, os, time, uuid
import requests

submission_id = str(uuid.uuid4())
body = json.dumps({
    "submissionId": submission_id,
    "fullName": "Demo Customer",
    "email": "demo@example.com"
}, separators=(",", ":"))
timestamp = str(int(time.time()))
signature = hmac.new(
    os.environ["UNICRM_WEB_TO_LEAD_SECRET"].encode(),
    f"{timestamp}.{body}".encode(),
    hashlib.sha256,
).hexdigest()
requests.post(os.environ["UNICRM_WEB_TO_LEAD_URL"], data=body, headers={
    "Content-Type": "application/json",
    "X-UniCRM-Timestamp": timestamp,
    "X-UniCRM-Idempotency-Key": submission_id,
    "X-UniCRM-Signature": signature,
}, timeout=10).raise_for_status()
```

## PHP

```php
<?php
$submissionId = bin2hex(random_bytes(16));
$body = json_encode([
  'submissionId' => $submissionId,
  'fullName' => $_POST['name'] ?? '',
  'email' => $_POST['email'] ?? '',
], JSON_UNESCAPED_SLASHES);
$timestamp = (string) time();
$signature = hash_hmac('sha256', $timestamp . '.' . $body, getenv('UNICRM_WEB_TO_LEAD_SECRET'));
$ch = curl_init(getenv('UNICRM_WEB_TO_LEAD_URL'));
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => $body,
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/json',
    'X-UniCRM-Timestamp: ' . $timestamp,
    'X-UniCRM-Idempotency-Key: ' . $submissionId,
    'X-UniCRM-Signature: ' . $signature,
  ],
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 10,
]);
$response = curl_exec($ch);
if ($response === false || curl_getinfo($ch, CURLINFO_RESPONSE_CODE) >= 300) {
  throw new RuntimeException('UniCRM submission failed');
}
```

## WordPress

Store both values in server configuration, not a post or browser script. The example hooks a custom
server-side form handler; adapt field names to the form plugin in use.

```php
add_action('admin_post_nopriv_submit_contact_form', 'send_unicrm_lead');
add_action('admin_post_submit_contact_form', 'send_unicrm_lead');
function send_unicrm_lead() {
  check_admin_referer('contact_form');
  $submission_id = wp_generate_uuid4();
  $body = wp_json_encode([
    'submissionId' => $submission_id,
    'fullName' => sanitize_text_field($_POST['name'] ?? ''),
    'email' => sanitize_email($_POST['email'] ?? ''),
    'message' => sanitize_textarea_field($_POST['message'] ?? ''),
  ]);
  $timestamp = (string) time();
  $signature = hash_hmac('sha256', $timestamp . '.' . $body, UNICRM_WEB_TO_LEAD_SECRET);
  wp_remote_post(UNICRM_WEB_TO_LEAD_URL, [
    'timeout' => 10,
    'headers' => [
      'Content-Type' => 'application/json',
      'X-UniCRM-Timestamp' => $timestamp,
      'X-UniCRM-Idempotency-Key' => $submission_id,
      'X-UniCRM-Signature' => $signature,
    ],
    'body' => $body,
  ]);
  wp_safe_redirect(home_url('/thank-you'));
  exit;
}
```

## Processing behavior

- UniCRM validates the integration, timestamp, raw-body signature, rate limit, idempotency keys, and
  payload before accepting it.
- The existing BullMQ integration queue processes accepted events with bounded retries and recovery.
- Matching Contacts are reused by normalized email, or by phone when email is absent. Companies are
  reused by organization-scoped case-insensitive name.
- Every genuinely new submission creates a new Lead. It does not merge into an older Lead.
- Tags, users, pipelines, stages, and custom-field definitions are revalidated in the integration's
  organization during processing.
- A successful Lead creation emits the existing `lead.created` business event once, so configured
  outbound webhooks and automations continue to work without a second execution system.
