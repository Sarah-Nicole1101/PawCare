# PawCare on Netlify

Netlify hosts the React frontend. The existing Express server runs on a separate Node host with MySQL, persistent uploads, and SMTP. Password plus authenticator MFA continues to run on that backend.

## Connect GitHub

Import `Sarah-Nicole1101/PawCare` from GitHub in Netlify. Use branch `main` and the repository root as the base directory. The committed `netlify.toml` sets Node 24, the build command, and publish directory `dist`.

Before the first deployment, configure:

| Where | Variable | Value |
|---|---|---|
| Netlify, build environment | `PAWCARE_API_ORIGIN` | HTTPS origin of the hosted Express server, with no path |
| Backend, runtime environment | `APP_ORIGIN` | Exact production Netlify HTTPS origin, with no trailing slash |
| Backend, runtime environment | Remaining settings | MySQL, SMTP, production keys and upload-volume path from `DEPLOYMENT.md` |

The build intentionally fails with a clear message if the backend origin is missing. It never deploys an apparent working app backed by a placeholder server.

The build generates `/api/*` proxy rules before the SPA fallback. Browsers call `/api` on the same Netlify origin, preserving the existing cookie and CSRF flow. Verify session cookies and POST requests on the deployed site. The backend must retain its `Cache-Control: no-store` API responses and enforce the production origin. Configure trusted proxies according to the chosen host and Netlify topology; do not broadly trust arbitrary forwarded headers.

Do not copy database passwords or MFA keys into frontend variables or source files. Keep them on the backend. When importing existing local data, preserve its matching authenticator/token keys and upload files as explained in `CONTAINER_DEPLOYMENT.md`.

## Deployment checks

1. Start and verify the backend with its persistent storage and production email settings.
2. Set the two origins above, then deploy `main` on Netlify.
3. Verify password plus MFA sign-in, record reads/writes, private photo/PDF uploads, and password reset email.
4. Test a harmless reminder, snooze, and completion on each intended device. Enable sounds again after opening a new browser tab.
5. Verify upload survival after restarting the backend and back up the database, upload volume, and keys together.

Deploy previews use different origins. Use a separate staging backend configured for a specific preview origin to test authenticated previews; the production backend deliberately rejects writes from unapproved origins.

References: [Netlify Vite setup](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/), [Netlify proxy rewrites](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).
