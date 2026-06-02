# Infrastructure preparation

This folder documents production infrastructure organization and provides deployment readiness guidance.

## Structure
- `Dockerfile` - container image build for VPS deployment and local production simulation.
- `docker-compose.yml` - local production stack with the application and Redis queue backend.
- `infra/env.example` - expected environment variables for production deployment.
- `infra/nginx/production.conf` - sample NGINX reverse proxy configuration for SSL, HTTP/2, and websocket support.

## Recommended architecture
- App runtime should be stateless.
- Persistence and state are managed by Supabase (database/auth/audit) and Redis (queue, websocket session state, background workers).
- Cloudflare Workers are the recommended edge hosting option for SSR and static asset distribution.
- VPS deployment is supported through Docker Compose and NGINX reverse proxy.

## Production readiness
- Validate environment variables before deployment.
- Use structured logging and capture logs centrally.
- Configure health checks and restart policies for container services.
- Separate backup responsibility from the app: Supabase database backups and Redis persistence snapshots.
- Use Cloudflare DNS and SSL for domain management, then route custom domain to Cloudflare Workers or VPS reverse proxy.
