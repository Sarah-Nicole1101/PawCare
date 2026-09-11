# Deploy the existing PawCare system

The included Dockerfile packages the React frontend and Express API as one Node 24 service. MySQL and a private persistent upload volume are required separately. Passwords, authenticator MFA, recovery codes, and all existing application tables are preserved. There is no live deployment or hosting account configured yet.

## What the hosting account must support

- One continuously running Node/Docker service behind HTTPS.
- MySQL 8.0.16+ (8.4 intended) or compatible MariaDB, reachable by the service.
- A private persistent volume mounted at `/app/uploads`, writable by UID/GID 1000.
- Outbound TLS SMTP to your email provider for account verification and password resets.
- Secret environment variables and backups for the database and uploaded files.

Use the detailed variable table in `DEPLOYMENT.md`. Set `APP_ORIGIN` to the final HTTPS address, `NODE_ENV=production`, `MAIL_MODE=smtp`, and the SMTP sender/credentials. Configure a dedicated runtime database user. Keep one app instance until shared storage has been implemented. Confirm SMTP availability on the selected hosting plan before provisioning.

## Build and first start

Run from the project root on a machine with Docker:

```bash
docker build -t pawcare:1.0.1 .
```

For a NEW empty database, run the schema initialization once using a privately stored environment file containing the production database connection and migration credentials:

```bash
docker run --rm --env-file /secure/pawcare-migration.env pawcare:1.0.1 npm run db:init
```

Use an absolute path appropriate to your server. The database host must be reachable from the container; `127.0.0.1` inside it refers to the container itself. Do not put environment files in source control or upload them with the application.

Example for a single server with an HTTPS reverse proxy on the same host and a named upload volume:

```bash
docker volume create pawcare-uploads
docker run -d --name pawcare --restart unless-stopped --env-file /secure/pawcare-production.env --mount source=pawcare-uploads,target=/app/uploads -p 127.0.0.1:3001:3001 pawcare:1.0.1
```

The runtime environment file uses the limited application database account, not migration credentials. Route the public HTTPS origin to the loopback port above. On an application hosting platform, configure its HTTPS service, assigned port, environment variables, and persistent volume instead of using this local reverse-proxy command. If the platform mounts a root-owned empty volume, provision its ownership for UID/GID 1000 before starting the app. The image runs as a non-root user.

The liveness endpoint is `/api/health`; it reports the process state, not continuous database readiness. Startup checks the schema. Configure Express trusted proxies for the exact hosting topology as explained in `DEPLOYMENT.md`.

## Move your current local data

1. Keep the local installation as a backup. Stop record changes while exporting a consistent database dump and copying the upload folder.
2. Import the complete database into the new database, including `schema_migrations`, accounts, authenticators, and file records. Preserve the matching upload files in the persistent volume.
3. Securely transfer the EXISTING `MFA_ENCRYPTION_KEY` and `TOKEN_HASH_KEY` alongside the database. Generating new keys for that existing database prevents existing authenticator secrets and token hashes from working. Do not paste keys or database dumps into chat.
4. Set the new HTTPS origin and production email/database settings. Start the app and sign in with the existing password and authenticator.
5. Verify records and downloads, restart the hosted app, then verify them again. Test verification/reset email delivery and a harmless reminder on each intended device.

For a fresh database, generate separate random keys instead. Back up keys securely with database and upload backups.

## Verification status

The frontend build and navigation regression tests were run in the development workspace. Docker is not available in that workspace, so this Dockerfile has not been built there. The selected host must still validate the image, database connection, SMTP, HTTPS, volume persistence, and alarms. The local working alarm does not prove behavior on a closed or sleeping browser after deployment.

The container follows the [official Docker Node.js guide](https://docs.docker.com/guides/nodejs/), using a separate frontend build stage and a non-root runtime with production dependencies.
