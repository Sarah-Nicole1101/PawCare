# PawCare deployment and operations

## Current status

The source, complete initial SQL schema, frontend build, and automated tests are included. No hosted application, domain, production email account, cloud storage, or production database has been created. This app uses its own password-and-TOTP authentication; it is not tied to ChatGPT sign-in.

A portable Docker deployment configuration and migration instructions are now included in `CONTAINER_DEPLOYMENT.md`.

## Required environment

Deploy a Node.js server behind HTTPS with a supported MySQL server. Keep the application’s upload directory on a private persistent volume; an ephemeral filesystem will lose uploaded photos and documents on restart or redeploy. A single Node instance with persistent disk is the simplest supported deployment for this release. Multiple instances require shared private file storage; the current adapter uses a filesystem path, not an S3 client.

Configure the environment from `.env.example`. For a fresh database, use unique production values for `MFA_ENCRYPTION_KEY` and `TOKEN_HASH_KEY` and back them up securely outside source control. When moving an existing database, preserve its existing keys so enrolled authenticators and stored token hashes keep working. Never include local `.env`, `.mail`, test files, or user uploads in a source bundle.

| Setting | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_ORIGIN` | Exact HTTPS origin, with no trailing slash or path |
| `PORT` | Port assigned to the Node service |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | Your database’s connection details |
| `DB_USER`, `DB_PASSWORD` | Dedicated application identity with required table permissions |
| `DB_SSL` | `true` for a remote database connection |
| `DB_SSL_CA_FILE` | Optional absolute path to the database provider’s CA certificate |
| `MFA_ENCRYPTION_KEY` | 32 random bytes encoded as 64 hex characters |
| `TOKEN_HASH_KEY` | A separate 32-byte random value encoded as 64 hex characters |
| `MAIL_MODE` | `smtp` |
| `SMTP_HOST`, `SMTP_PORT` | Your transactional email server |
| `SMTP_SECURE` | `true` for implicit TLS (usually port 465); `false` for STARTTLS (usually port 587) |
| `SMTP_USER`, `SMTP_PASSWORD` | SMTP credentials |
| `MAIL_FROM` | Verified sender identity on your email service |
| `UPLOAD_DIR` | Absolute path to the private persistent upload volume |

The application refuses production startup without a valid HTTPS origin and SMTP host. The SMTP transport must require TLS when using STARTTLS; keep certificate validation enabled. Configure the sender’s required DNS records through your email provider. Actual email delivery requires an end-to-end test with that provider.

## Release sequence

1. Provision the database and private storage. Separate schema-migration credentials from the normal application account.
2. Run `npm ci` and `npm run build` from the project root in a build environment.
3. Configure production environment values. Run `npm run db:init` with credentials that can create the database/schema. Repeated initialization checks the recorded migration checksum. Preserve `schema_migrations`; use a new reviewed migration for later schema changes.
4. Give the runtime identity only the permissions it needs on this database: SELECT, INSERT, UPDATE, and DELETE. It should not be able to administer users or drop databases.
5. Start `npm start` behind an HTTPS reverse proxy. Point the domain to that service. Serve the frontend and `/api` from the same origin.
6. If the proxy changes source IP addresses, set Express’s `trust proxy` to the exact trusted proxy topology in `server/app.js`. Do not blindly trust arbitrary forwarded headers. Without this adjustment, IP rate limits may group all visitors behind the proxy.
7. Configure a process supervisor, restart behavior, HTTPS renewal, and restricted administrative access.
8. Complete the manual release checks below before relying on the app for your household.

## Manual release checks

- Register a real account; receive and redeem the verification email once.
- Enroll an authenticator, save recovery codes, sign out, and sign in with both factors.
- Verify recovery-code use and authenticator replacement on the deployed service.
- Verify password-reset delivery and confirm that MFA is still required afterward.
- Join a household with another account and confirm access is restricted to its members.
- Upload a photo and a PDF; confirm they survive an application restart and remain private.
- Schedule a harmless custom reminder two minutes ahead on each intended phone/computer. Enable sound and verify the actual alarm, snooze, dismiss, and completion behavior.
- Test mobile layouts, keyboard use, text enlargement, notification permissions denied/allowed, browser backgrounding, device sleep, and network interruption.
- Verify that a signed-out or removed user cannot fetch cached private file URLs.
- Test a database-and-upload restore to an isolated environment.

## Backups

Back up the database, upload volume, and encryption keys as one recoverable system. An SQL dump without the corresponding upload files loses documents; a restored database without its authenticator key prevents MFA verification. Store encrypted backups separately from the running server and test restoration. Establish the backup frequency and retention appropriate for the family’s usage before entering important records.

Do not log request bodies on authentication routes, passwords, QR provisioning URLs, setup keys, OTPs, recovery codes, raw session cookies, verification/reset links, or SMTP credentials. Security-event rows intentionally contain event names and timestamps only. Application error responses do not expose SQL details.

Archived pets, records, and files remain in the database/storage. This release does not include a destructive retention-purge job. Review retention and deletion needs before adding one.

## Operational limits

- MySQL stores shared records; browser storage is used only for the device’s volume preference.
- Sessions last 12 hours and partial password-only login challenges last five minutes.
- In-app polling checks every 15 seconds; the visible page checks its loaded due list every second.
- The server generates occurrences through the next seven days when care data is requested. Generation catches up in bounded batches. It does not run a closed-app notification service.
- Primary record lists load 500 rows at a time and offer Load older records. The dashboard’s detailed record previews use their latest page. The live care query is capped at 1,000 rows; resolve old pending tasks regularly. Very large backlogs need a separate paginated historical-task view before expanding beyond household usage.
- Uploads are limited to 5 MB. Images are decoded, rotated, resized, stripped of metadata, and stored as WEBP. PDFs are header-checked and downloaded as attachments. No malware-scanning service is integrated.
- Timezone, recurrence, and concurrency logic have automated checks. Browser sound delivery, hosting, SMTP, backup restoration, and exact MySQL-server-version compatibility still require validation in the target environment.

## Reference

Browsers restrict autoplay and may throttle background timers. The app deliberately asks the user to enable audio and documents its active-page limitation. See [MDN autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) and [MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
