# Nginx infrastructure

`unicrm.conf` is the internal-beta reverse-proxy template. It enforces HTTPS, forwards request IDs
and proxy headers, sends `/api/*` to NestJS, and sends all other requests to Next.js.

Place TLS assets at `infrastructure/nginx/certs/fullchain.pem` and
`infrastructure/nginx/certs/privkey.pem` or replace those paths with your certificate manager's
mounts before deploying.
