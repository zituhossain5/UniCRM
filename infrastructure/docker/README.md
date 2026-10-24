# Docker infrastructure

UniCRM uses two separate local Docker workflows. Keep their Compose project names separate so local
development data is not confused with production-validation data.

## Development infrastructure

The repository root `docker-compose.yml` starts only infrastructure services for local development:
PostgreSQL, Redis, MinIO, and Mailpit. The API, worker, and web app normally run on the host through
pnpm for hot reload.

```powershell
docker compose up -d
corepack pnpm prisma:migrate
corepack pnpm bootstrap
corepack pnpm dev
```

Stop development infrastructure without deleting data:

```powershell
docker compose stop
```

The development stack uses these named volumes:

- `unicrm_postgres_data`
- `unicrm_redis_data`
- `unicrm_minio_data`

## Production-like validation

`docker-compose.prod.example.yml` is the production template. For local production-like validation,
combine it with `docker-compose.validation.yml` and the explicit `unicrm-m7` project name. The
validation override adds safe local MinIO/Mailpit wiring, host ports, and production-mode API/worker
environment values while preserving the production requirements for queued email and S3-compatible
storage.

```powershell
docker compose -p unicrm-m7 -f docker-compose.prod.example.yml -f docker-compose.validation.yml --env-file .env.production.example up -d --build postgres redis minio mailpit
docker compose -p unicrm-m7 -f docker-compose.prod.example.yml -f docker-compose.validation.yml --env-file .env.production.example run --rm api ./node_modules/.bin/prisma migrate deploy
docker compose -p unicrm-m7 -f docker-compose.prod.example.yml -f docker-compose.validation.yml --env-file .env.production.example up -d --build api worker web
```

Verify the validation API:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4400/api/v1/health/live
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4400/api/v1/health/ready
```

Stop production-like validation without deleting data:

```powershell
docker compose -p unicrm-m7 -f docker-compose.prod.example.yml -f docker-compose.validation.yml --env-file .env.production.example stop
```

The production-validation stack uses these named volumes:

- `unicrm-m7_postgres_data`
- `unicrm-m7_redis_data`
- `unicrm-m7_minio_data`

## Secure public demo runtime

The production template also defines `demo-api`, `demo-worker`, `demo-postgres`, `demo-redis`, and
`demo-minio`. The API image is built once as `unicrm-api:${UNICRM_IMAGE_TAG:-local}` and is reused by
both API and both worker containers. Demo PostgreSQL, Redis, queue prefix, cookies, and object storage
are separate from production. The demo databases and object store have no published host ports.

Prepare both databases before starting application traffic:

```powershell
docker compose -f docker-compose.prod.example.yml --env-file .env.production run --rm api ./node_modules/.bin/prisma migrate deploy
docker compose -f docker-compose.prod.example.yml --env-file .env.production run --rm demo-api ./node_modules/.bin/prisma migrate deploy
docker compose -f docker-compose.prod.example.yml --env-file .env.production up -d api worker demo-api demo-worker web
```

For a VPS with an existing Traefik instance, attach the explicit routing override:

```powershell
docker compose -f docker-compose.prod.example.yml -f docker-compose.traefik.example.yml --env-file .env.production up -d --build
```

The Traefik priorities are intentionally ordered: `/demo-api/v1` routes to `demo-api` at priority
300, `/api/v1` routes to production `api` at priority 200, and the web application is the host
fallback at priority 100. The demo prefix is rewritten to the API's internal `/api/v1` prefix.

The Nginx example has the equivalent explicit `/demo-api/` upstream for installations that have not
migrated to Traefik.

### Local public demo

The browser uses `NEXT_PUBLIC_DEMO_API_URL=http://localhost:4500/api/v1` in development. Port 4500 is
bound to `127.0.0.1` only by `docker-compose.demo-local.yml`; the demo PostgreSQL, Redis, and MinIO
services are not exposed to the host. The local override also permits only the Next.js origin at
`http://localhost:3001` and uses non-secure cookies only because local development runs over HTTP.

Start the normal development infrastructure and the isolated demo runtime from the repository root:

```powershell
docker compose up -d
docker compose -p unicrm-demo-local -f docker-compose.prod.example.yml -f docker-compose.demo-local.yml --env-file .env.production.example build demo-api
docker compose -p unicrm-demo-local -f docker-compose.prod.example.yml -f docker-compose.demo-local.yml --env-file .env.production.example up -d demo-postgres demo-redis demo-minio demo-storage-init
docker compose -p unicrm-demo-local -f docker-compose.prod.example.yml -f docker-compose.demo-local.yml --env-file .env.production.example run --rm demo-api ./node_modules/.bin/prisma migrate deploy
docker compose -p unicrm-demo-local -f docker-compose.prod.example.yml -f docker-compose.demo-local.yml --env-file .env.production.example up -d demo-api demo-worker
corepack pnpm dev
```

Stop the local demo application without deleting its isolated data:

```powershell
docker compose -p unicrm-demo-local -f docker-compose.prod.example.yml -f docker-compose.demo-local.yml --env-file .env.production.example stop demo-worker demo-api demo-minio demo-redis demo-postgres
```

## Data safety

Use `docker compose stop` for normal shutdown. `docker compose down` removes containers and networks
but keeps named volumes. `docker compose down -v` deletes the named volumes and therefore deletes
persisted local PostgreSQL, Redis, and MinIO data for that Compose project.

Before any destructive cleanup, inspect the target project and volumes:

```powershell
docker compose ls
docker ps -a
docker volume ls
docker volume inspect <volume-name>
```

Do not use local development secrets or local object storage settings for a real production
deployment. Copy the production examples and replace every placeholder secret.
