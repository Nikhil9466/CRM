# Virtual Binz CRM

A team CRM for managing contacts, deals, tasks and sales pipelines. Built with
Express, Prisma and PostgreSQL, with a browser frontend served by the backend.

## Included

- Responsive dashboard: real contact count, active deals, won value this month,
  pending tasks, six-month wins chart, pipeline totals and today's tasks.
- Working Contacts, Deals and Tasks views: create/edit, admin-only permanent
  deletion, pagination and filtering. Admin contact assignment.
- Contact-linked deals, INR amounts, expected close dates and stage dropdowns.
- Admin-editable pipeline names/order and custom Open/Won/Lost-type stages.
- Task completion, due dates, optional contact OR deal link.
- Global search, light/dark mode, shared organisation data and server-enforced roles.
- Team-member creation, role changes and account deactivation.
- Database migration, tests, environment template and admin-promotion command.

Excluded: CSV import/export, tags, kanban dragging, notifications, notes, activity
timeline, exportable reports and recycle bin.

The backend serves **front end/home.html** and its supporting files.
Back up your PostgreSQL database before applying migrations, and test upgrades
against a copy first. Keep `.env` private.

## Run locally

Requires Node.js 20+ and a running PostgreSQL database.
From the repository root:

    cd crm-backend
    npm ci
    cp .env.example .env

Edit .env: set DATABASE_URL to your PostgreSQL connection string and JWT_SECRET
to a long random secret. Generate a secret with:

    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

Then:

    npm run prisma:generate
    npm run db:deploy
    npm start

Open **http://localhost:4000**. Do not open home.html by double-clicking or
through Live Server: frontend and API are intentionally served together.

### Existing database / account

Both migrations are supplied. The original migration is unchanged. The new one
adds tables and account fields without deleting old users. If the original is
already recorded, db:deploy only applies the new migration.

If you originally used prisma db push, Prisma may require a baseline. Do not
reset your database. After verifying that the existing users table matches the
original migration, mark ONLY that original migration as applied:

    npx prisma migrate resolve --applied 20260921085113_add_password_reset
    npm run db:deploy

Existing accounts default to regular users. Promote your own trusted account:

    npm run admin:promote -- your-exact-existing-email@example.com

This is a local server-operator command, not a public endpoint. It matches the
stored email exactly. Log in again afterward.

Review historical members: the old signup allowed arbitrary organisation IDs,
so historical membership was not verified. Deactivate unknown accounts.
Consider rotating JWT_SECRET on upgrade to invalidate old sessions.

### Fresh database

Choose **Create a new workspace** on the login page. Its creator becomes admin.
Existing organisation IDs cannot be joined through public signup.
Admins add members under **Team & settings**, then privately share their initial
password. Members can change it at /account.html.

Public signup allows creation of new, isolated organisations. Disable it at your
deployment gateway if you require an invitation-only installation.

## Permissions

| Action | Regular user | Admin |
| --- | --- | --- |
| View organisation data and dashboard | Yes | Yes |
| Create/edit contacts, deals and tasks | Yes | Yes |
| Change deal stage / complete tasks | Yes | Yes |
| Assign/reassign contacts | No | Yes |
| Permanently delete CRM records | No | Yes |
| Manage stages and team access | No | Yes |
| Access another organisation's data | No | No |

Users share all records within their organisation. Assignment does NOT hide a
contact from teammates. Roles are loaded from the database on each request.
Admins cannot demote/deactivate themselves. Deactivation invalidates existing
sessions, even after reactivation.

Deletion is permanent and confirmed. Contacts/deals/stages with linked records
are protected from deletion. Unlink/delete related records first; there are no
silent cascading deletions.

## Reporting definitions

- Total contacts: all organisation contacts, not a guessed "open leads" count.
- Active deals / open pipeline value: deals in Open-type stages.
- Won this month: currently Won-type deals with actual closedAt in the current
  UTC calendar month. Expected close dates do not determine revenue.
- Wins chart: currently Won-type deals for each of the last six UTC months.
- Pending tasks: all incomplete team tasks.
- Today's tasks: incomplete tasks on the browser's local date, first 8;
  full list under Tasks.

Moving a deal to a terminal stage records its close time. Reopening removes it
from won reports. Reports reflect current records, not immutable accounting or
historical audit records. Hard-deleting a deal removes its contribution.
Zero means no matching records, not a placeholder. Errors are separate from zero.
Refresh retrieves shared changes; there are no push alerts.
Company filtering means the contact's company, not cross-tenant organisation access.

## Authentication changes

- Normal email domains accepted rather than Gmail only.
- New passwords: 12+ characters, at most 72 UTF-8 bytes for bcrypt.
- Existing password hashes and login credentials remain compatible.
- Password changes require the current password and revoke prior sessions.
- Unsafe email + organisation-ID password reset is disabled. Secure email
  recovery remains future work. Operators must verify identity before recovery.
- Profile photos are not supported. Existing photo columns/files are retained;
  initials are shown instead. Uploads are not served.
- Login checkbox now chooses localStorage (persistent) or sessionStorage
  (tab session). Browser tokens alone cannot grant admin rights.

## Tests

    npm test

For API integration, migrate a separate disposable PostgreSQL test database first.
Never use production:

    CRM_TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/crm_test" npm run test:integration

Tests create isolated organisations and clean up their own records. Without
CRM_TEST_DATABASE_URL, integration tests skip rather than using your .env.

## Before production

Use HTTPS, backups, private database credentials, dependency updates and
deployment-specific rate limiting. Login rate limits are in-process, not shared
across multiple server instances. Configure proxy trust for your actual topology.

Bearer-token browser storage is preserved for simplicity. Production should
consider HttpOnly secure cookie sessions with CSRF protection and a strict
Content Security Policy. Complete a deployment/security review before using
real customer information. Google Fonts is optional; system fonts are the fallback.

## API map

- POST /api/auth/signup, /api/auth/login
- GET /api/me; POST /api/password
- GET /api/dashboard?today=YYYY-MM-DD
- GET /api/search?q=...
- GET/POST /api/contacts, /api/deals, /api/tasks
- GET/PATCH/DELETE /api/{resource}/:id
- GET/POST /api/stages; PATCH/DELETE /api/stages/:id
- GET/POST /api/members; PATCH /api/members/:id

CRM endpoints require Authorization: Bearer TOKEN.
Collections return {items,total,page,pageSize}, 50 rows per page; stages and members
return arrays. Money is represented as decimal strings. Contact edits submit the
full contact form; deal/task edits allow partial fields. Record text is escaped
before rendering HTML.
