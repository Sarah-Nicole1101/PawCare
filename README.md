# PawCare

A family pet-care web application with a minimalist black-and-white interface, a React frontend, a Node/Express backend, and a relational MySQL database.

**Start here:** [Local setup](#local-setup). Database definitions are in [database/schema.sql](database/schema.sql). The [system design](docs/SYSTEM_DESIGN.md) explains the relationships and access rules. [Verification](docs/VERIFICATION.md) records what was tested.

## Included features

- Registration, email verification, password reset, and logout.
- Mandatory password + authenticator-app MFA for each user; QR/manual-key enrollment, ten recovery codes, single-use verification, attempt limits, and secure authenticator replacement.
- Household creation, private invitation links, separate family accounts, admin/member roles, and activity history.
- Pet profiles with photo preview, upload, replacement, removal, and archiving.
- Medications with daily, weekly, selected-weekday, monthly, one-time, and fixed-hour schedules; multiple clock times where applicable.
- Audible in-app reminders, browser notification permission, snooze, dismiss, completed/skipped outcomes, and a shared medication history.
- Health records, vaccinations, appointments, weight tracking, feeding plans, grooming records, and expenses in Philippine pesos.
- Private documents and attachments to health, vaccination, or expense records.
- Responsive dashboard, pet/search/date/status filters, and loading older records.

This is a runnable source project. A public server, domain, SMTP account, or production database has **not** been provisioned. It contains no real medical records, default login, production secret, or preconfigured family accounts.

## Local setup

### 1. Install prerequisites

Use Node.js 22.12 or newer on a supported LTS release, npm, and a running MySQL 8.0.16+ or MySQL 8.4 server. MySQL Workbench is an optional database viewer; Workbench alone does not start a database server. The integration suite was run here against MariaDB 10.11.18, which also supports this schema.

Extract this project into a folder, then open a terminal **inside the `pawcare` folder** containing `package.json`.

```bash
npm ci
npm run setup
```

`setup` creates `.env` with random encryption and token-hashing keys. It preserves an existing `.env`. Keep those keys: changing or losing them will invalidate sessions/recovery tokens or make existing authenticator secrets unreadable.

### 2. Set your MySQL connection

Open `.env` in your editor and set these values for your local server:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=pawcare
DB_USER=root
DB_PASSWORD=your_local_mysql_password
```

Keep `APP_ORIGIN=http://localhost:5173` and `NODE_ENV=development` for the normal development command. Use an account permitted to create the development database for initialization. Do not use the database root account as the production application identity.

```bash
npm run db:init
npm run dev
```

Open [PawCare locally](http://localhost:5173). The API runs on port 3001; the React development server forwards `/api` calls to it. `Ctrl+C` stops development.

### 3. Create your first account and enable MFA

1. Select **Create an account** and enter your own name, email, and a password of at least 12 characters.
2. During local development, email messages are saved as text files in the project’s `.mail` folder. Open the newest verification message and copy its `http://localhost:5173/#verify=...` link into your browser. This folder is a development mailbox; no real email is sent in `MAIL_MODE=file`.
3. Select **Verify email**, then sign in with your password.
4. Select **Set up authenticator**. Scan the QR with a TOTP authenticator app, or enter the displayed setup key manually. Use the six-digit code to confirm enrollment.
5. Download and privately save all ten recovery codes. Check the confirmation box and continue.
6. Create your household; the default timezone is **Asia/Manila**.
7. Add your pet, upload a photo, and enter the actual care instructions you want to record.

Authenticator codes change every 30 seconds. PawCare rejects an already-used code; wait for the next code when signing in immediately after setup. Each family member uses their own account and authenticator.

Forgot-password messages also appear in `.mail` during local development. Password reset does not remove MFA. An unused recovery code works with the password if the authenticator is unavailable. If both the authenticator and all recovery codes are lost, there is no self-service account recovery bypass.

### 4. Test a reminder

Create a **Custom reminder** for a few minutes from now. Use **Enable reminder sounds** and keep the page open and active. The popup offers completion, 5/10/15/30-minute snooze, and dismiss. Additional snooze durations and a skipped-with-reason action are available from a due task’s clock button.

For medications, enter the veterinarian’s instructions. PawCare stores your entries; it does not choose doses or advise changing treatment. Dismiss and snooze do not mark medicine as given. Family completion is stored once, even if two people submit it together.

Alarms require an active authenticated page, a working connection, and browser/device permission to play audio. Browser notifications are requested separately. Closed pages, sleeping devices, muted audio, and expired sessions can prevent alerts. Old unresolved tasks remain visible; alerts more than 15 minutes overdue are shown in the care list instead of replaying a backlog of sounds. A snoozed alert uses its snooze time for that window. Sessions expire after 12 hours; sign in again to continue.

This release does not implement closed-app Web Push, SMS, email medication reminders, or a native mobile alarm service.

### 5. Invite family

In **Family**, enter the member’s email and create an invitation link. Share that link yourself. The app does not automatically email invitations. A link expires after seven days and is accepted only by the matching verified email. The member must finish MFA before joining. One active household per account is supported.

## Running the built application

For a local production-build check, leave `NODE_ENV=development` and change `APP_ORIGIN` to `http://localhost:3001`, then:

```bash
npm run build
npm start
```

Open [the built app locally](http://localhost:3001). This uses the built frontend; it is not a secure internet deployment. To return to `npm run dev`, restore `APP_ORIGIN=http://localhost:5173`.

## Tests

```bash
npm test
```

This runs the password, encryption, TOTP, and timezone/recurrence checks. Database integration tests are skipped unless explicitly enabled against an isolated database.

For integration testing, use a separate database name ending in `_test`, set `DB_NAME` accordingly in a temporary test environment, set `PAWCARE_INTEGRATION=1`, initialize it with `npm run db:init`, then run `npm test`. Never run integration tests against your real household database. Tests create synthetic accounts, records, files, and local email messages; they do not clean an existing database. Keep a separate disposable working copy for this test command.

## Project structure

| Path | Purpose |
|---|---|
| `client/src` | React pages, forms, alarm behavior, and responsive styles |
| `client/public/alarm.wav` | Locally generated reminder tone |
| `server/auth.js` | Registration, verification, login, MFA, recovery, and session actions |
| `server/security.js` | Argon2id, authenticated encryption, TOTP, CSRF, sessions, and rate limits |
| `server/care.js` | Household, pet, medical, schedule, and completion APIs |
| `server/files.js` | Private upload, download, attachment, and archive APIs |
| `server/scheduler.js` | Timezone-aware recurrence and occurrence generation |
| `database/schema.sql` | 27 application tables with relationships, indexes, and constraints |
| `scripts/migrate.mjs` | Database creation and migration checksum tracking |
| `docs` | Requirements, architecture, API notes, deployment, and verification |
| `tests` | Unit and database-backed integration checks |

## Deployment

Use [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). PawCare needs a Node server, MySQL, private persistent upload storage, and transactional email. Static-only hosting such as GitHub Pages cannot run this backend. No deployment has been made by this handoff.

## Common setup problems

| Symptom | What to check |
|---|---|
| `ECONNREFUSED` at port 3306 | Start the MySQL service and verify `DB_PORT`. |
| `Access denied for user` | Check the local database username/password and its permissions. |
| Encryption key missing | Run `npm run setup` on a new project, or restore your original `.env`. Do not replace an existing key arbitrarily. |
| No verification email in your inbox | Local mode writes messages to `.mail`; production requires SMTP. |
| “Your session changed” | Refresh. Ensure `APP_ORIGIN` exactly matches the URL used, including protocol and port. |
| Authenticator code refused after setup | Wait for a new 30-second code; ensure the phone’s date/time is automatic. |
| Phone photo rejected | Convert HEIC to JPG/PNG/WEBP; the upload limit is 5 MB. |
| Audio does not play | Use Enable sounds, check volume/browser permissions, and keep the page active. |
| Migration partly applied after an error | On a new, empty development database only, create a fresh database name and retry. Do not drop a database containing real records. |

The source includes a lockfile. Prefer `npm ci` for the reviewed dependency versions.
