# PawCare verification record

**Build date:** September 11, 2026  
**Status:** Working source and initial database delivered; production deployment remains unconfigured.

## Executed checks

- The production frontend build completed with Vite.
- `npm audit --omit=dev` reported zero known production dependency vulnerabilities for the included lockfile.
- All 27 application tables and the migration-tracking table were created on an isolated MariaDB 10.11.18 instance using the supplied migration script.
- Seventeen database-backed integration scenarios passed through the actual Express API and database, including real image decode/upload/download.
- Twelve unit checks passed for password verification, authenticated secret encryption, TOTP, recovery-code normalization, and recurrence/timezone behavior.

### Integration scenarios

1. Registration, local email verification, MFA enrollment, encrypted secret storage, and hashed recovery codes.
2. CSRF rejection and rejection of a different request Origin.
3. Household creation and pet creation by an admin.
4. Email-bound family invitations and one-time acceptance.
5. Denial of data access after password-only login; successful single-use recovery-code login.
6. Member role restrictions and rejection of cross-household pet access.
7. Saving and reading health, vaccination, appointment, weight, feeding, grooming, and expense records.
8. Medication scheduling and idempotent occurrence generation.
9. Dismiss and snooze preserving a pending dose.
10. Simultaneous family completion producing one medication log and one conflict response.
11. Actual PNG upload, conversion to WEBP, authorized download, unauthorized download denial, and fake-image rejection.
12. Protection of the last household admin.
13. TOTP replay rejection on a subsequent login.
14. Authenticator replacement requiring step-up, retaining the old factor until confirmation, and invalidating the old recovery set.
15. Five failed MFA attempts ending the partial session.
16. Stopping a schedule while preserving completed history and cancelling future pending tasks.
17. Password reset preserving MFA and invalidating old sessions.

### Unit checks

The security suite covers correct/incorrect password verification, encryption round-trip and tamper rejection, an RFC TOTP vector and expiry, and recovery-code formatting. The scheduler suite covers Manila daily time, one-time completion, elapsed-hour intervals, selected weekdays, month-end clamping without March drift, an end date, daylight-saving wall-clock behavior, and a future start date.

## Reminders navigation fix (1.0.1)

A React DOM test with jsdom reproduced the reported blank-page failure by navigating from Health records to Reminders while the reminder response was delayed. The original component threw an undefined `.map` error. After the fix, that test passes and verifies cleared stale records, URL-backed page selection on remount, and browser Back navigation. The user reported working local alarm sound. Hosted alarm behavior remains to be tested. The production frontend build and all 13 current unit/navigation checks pass. The database integration suite was not rerun for this frontend-only fix. The new Dockerfile is prepared but unbuilt here because Docker is unavailable.

## Boundaries of this verification

Tests used synthetic data in an isolated local database. They did not send external messages or create real family/pet accounts. The bundled source excludes local test mail, records, uploads, database files, and configuration secrets.

The runtime available for database testing was MariaDB 10.11.18, not Oracle MySQL 8.4. The schema targets compatible MySQL syntax, but the exact intended MySQL installation still needs an initial import and smoke test. No browser automation or visual screenshot review was performed. Production SMTP, HTTPS cookies behind a real proxy, phone sound/notifications, upload durability after deployment, and backup restoration have not been tested here. Use the deployment checklist for these checks.

Automated checks are targeted regression evidence, not a claim of a complete penetration test, universal device compatibility, or guaranteed medication alarm delivery.
