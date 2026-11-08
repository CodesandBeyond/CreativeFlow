# CreativeFlow

A working, self-hosted freelancer workspace and client portal with a responsive dashboard, project management, client invitations, versioned deliverables, client approvals, contracts, invoices, and an activity log.

## Run locally

Requires **Node.js 22.5+**. No npm packages or API keys required.

```bash
npm start
```

Visit **http://localhost:3000** and create a freelancer account.

## Typical workflow

1. Add a client under **Clients**.
2. Create a project, assign that client, and set the budget and deadline.
3. Open the project and add deliverables. Upload a design file to each deliverable.
4. In **Clients**, choose **Invite client**, copy the invitation link and share it with the client. Client signs up with the invitation URL and can view only their assigned projects.
5. Client opens the project, downloads the design, and selects **Approve** or **Request changes**. The freelancer can upload another revision, which resets review to **In review**.
6. Create a contract; the client can sign by typing their full account name.
7. Create an invoice; mark it **Sent**, then **Paid** after payment is received.

## Architecture

- Frontend: HTML, CSS and vanilla JavaScript (responsive SPA)
- API: Node.js built-in HTTP server (`server.js`)
- Persistence: SQLite (`node:sqlite`), stored at `data/creativeflow.sqlite`
- Authentication: scrypt password hashing and opaque HttpOnly session cookies
- Uploads: local private filesystem, authorized download endpoint, 8 MB max per file
- Roles: freelancer and client, with server-side ownership checks

This is a functional **MVP**, not a fully integrated production SaaS. Payment statuses are manual: Stripe checkout and webhook reconciliation are **not** implemented. Contract signing is a simple acknowledgment workflow, **not** a legally vetted e-signature system. Invitations are shared as links (email is not sent automatically). Notifications and recurring reminders are not implemented. Before public deployment, add CSRF protection, rate limiting, email verification, account recovery, malware scanning, durable object storage, automated backups, comprehensive tests, audit/retention policies, and a deployment-grade reverse proxy with HTTPS. Set `COOKIE_SECURE=true` behind HTTPS and `APP_URL=https://your-domain.example` for invitation URLs.

## Project structure

```text
creativeflow/
  server.js           # API, authentication, SQLite schema
  public/index.html   # App shell
  public/app.js       # Freelancer and client UI
  public/styles.css   # Responsive design system
  data/               # SQLite and uploads, generated at runtime
```
