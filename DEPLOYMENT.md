# Production Deployment Readiness

This document captures the platform-level deployment readiness for VPS, Cloudflare, SSL, and horizontal scaling.

## 1. Deployment targets

### VPS deployment
- Use Docker and Docker Compose to package the app and Redis.
- Use an NGINX reverse proxy or Cloudflare Tunnel to terminate SSL.
- Keep the app stateless so multiple VPS instances can scale horizontally.

### Cloudflare deployment
- Deploy the SSR application via `wrangler publish`.
- Let Cloudflare manage SSL and edge delivery.
- Use Cloudflare DNS for domain and certificate management.

### Hybrid architecture
- App runtime can be deployed in a containerized VPS pool for private workloads.
- Use Cloudflare for global edge routing and custom domain termination.
- External resources such as Supabase and Redis remain centralized.

## 2. Environment configuration

Required environment variables are documented in `infra/env.example`.

Essential production values:
- `NODE_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `REDIS_URL`
- `LOG_LEVEL`
- `LOG_FORMAT`

Validate configuration before deployment with:
```bash
node scripts/validate-env.js
```

## 3. Docker preparation

Root-level files:
- `Dockerfile` — builds the production image and serves the built site using `vite preview`.
- `docker-compose.yml` — runs the app together with Redis and includes a container health check.
- `.dockerignore` — excludes development artifacts, secrets, and build output.

Use:
```bash
docker compose build
docker compose up -d
```

## 4. Redis and queue architecture

Redis is the recommended state backend for:
- task orchestration and background queue processing
- websocket session coordination
- real-time state caching and event delivery

Prepared helpers:
- `src/lib/infra/redis.ts`
- `src/lib/infra/queue.ts`

Queue workers can be added as dedicated services and scale independently of the app.

## 5. Websocket scaling preparation

For production websocket scaling:
- keep websocket and market feed ingestion stateless or externally coordinated via Redis pub/sub
- use a dedicated websocket gateway if the app evolves to serve client socket connections
- configure `proxy_set_header Upgrade` and `Connection: Upgrade` in NGINX for websocket reverse proxying

## 6. SSL and domain setup

For Cloudflare:
- add the custom domain in Cloudflare DNS
- configure SSL/TLS to use Full (Strict) if possible
- route the domain to the Worker or origin

For VPS:
- obtain certificates via Certbot / Let’s Encrypt
- use `infra/nginx/production.conf` as a sample reverse proxy configuration
- set up HTTP to HTTPS redirection and secure headers

## 7. Monitoring and logging

Structured logging helper is available in `src/lib/logger.ts`.

Use production monitoring for:
- app health checks
- Redis availability
- Supabase connectivity
- security and audit event streams
- backup and restore pipelines

## 8. Backup and crash recovery

Recommended strategy:
- Supabase: enable automatic database backups and PITR snapshots.
- Redis: enable persistence with AOF/RDB and store snapshots off-host.
- App: use container restart policies and periodic rebuilds.
- Recovery: perform restored test cases regularly, including database restore and service restart.

## 9. Deployment scripts

Available scripts:
- `npm run env:validate` — validate required environment variables.
- `npm run deploy:cloudflare` — validate env and publish via Wrangler.
- `npm run deploy:vps` — validate env, build Docker images, and start Docker Compose.

## 10. Production readiness checklist

- [ ] Environment variables validated
- [ ] Docker image built and containerized
- [ ] Redis queue backend configured
- [ ] SSL certificate installed and auto-renewal configured
- [ ] Domain DNS and Cloudflare routing verified
- [ ] Health checks enabled on app containers
- [ ] Structured logging configured
- [ ] Monitoring engine and alerting enabled
- [ ] Backup schedule configured and tested
- [ ] Crash recovery tested and documented
