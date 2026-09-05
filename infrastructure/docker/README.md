# Docker infrastructure

Local PostgreSQL and Redis services are defined in the repository root `docker-compose.yml`.

Production-oriented examples are now included for internal beta hardening:

- `apps/api/Dockerfile` builds the NestJS API and worker runtime.
- `apps/web/Dockerfile` builds the Next.js web runtime.
- `docker-compose.prod.example.yml` wires API, worker, web, PostgreSQL, Redis, and Nginx.

Copy the example compose file and provide a real `.env.production`; do not use local development
secrets or local storage in production.
