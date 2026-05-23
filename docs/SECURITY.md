# Security

This repository is a **local learning lab**, not production software.

## Intentional defaults

- Database passwords (`postgres`, `replicator_pass`) are hardcoded in `docker-compose.yml` and init scripts on purpose.
- All services bind to `localhost` ports for local development only.
- These credentials must **never** be used outside a isolated local environment.

## Before deploying anything based on this repo

- Replace all default passwords with secrets from a vault or env vars.
- Do not expose Postgres or PgBouncer ports to the public internet.
- Restrict `pg_hba.conf` to trusted networks.
- Add TLS, authentication, rate limiting, and monitoring.

## Reporting issues

If you find a security problem in this project (not the intentional lab defaults), open an issue at:

https://github.com/juliofihdeldev/pg-scaling-lab/issues
