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
