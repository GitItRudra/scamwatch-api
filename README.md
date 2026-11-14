# ScamWatch API

Backend for a scam reporting platform. People report phone numbers, UPI IDs, emails, links and bank accounts used in scams. Moderators verify the reports, and anyone can check an identifier before paying it and get a risk score back.

Built with Node.js, Express and MongoDB (Mongoose). There is no frontend; the API is documented with Swagger.

## What it does

- Accounts with JWT access tokens and rotating refresh tokens, three roles (user, moderator, admin), account lockout after repeated failed logins
- Scam reports with search, filters, pagination, anonymous posting and evidence uploads
- Moderation workflow: reports start as pending, a moderator verifies or rejects them, rejected reports can be edited and resubmitted
- Risk assessment for any identifier, with a score from 0 to 100 and a breakdown of how it was reached
- Community features: upvotes and comments on verified reports
- Statistics built with MongoDB aggregation pipelines, an admin dashboard and an audit log of staff actions

## Running it

You need Node 18 or newer and a MongoDB instance (local or Atlas).

```bash
npm install
cp .env.example .env        # then edit MONGO_URI and JWT_ACCESS_SECRET
npm run seed:demo           # admin, moderator, two reporters and a few sample reports
npm run dev
```

The API runs on `http://localhost:5000`, Swagger UI is at `/api/docs` and a health check is at `/health`.

Seeded accounts (password `ChangeMe123` unless `SEED_ADMIN_PASSWORD` is set): `admin@scamwatch.local`, `moderator@scamwatch.local`, `reporter.a@scamwatch.local`, `reporter.b@scamwatch.local`.

With Docker: `JWT_ACCESS_SECRET=<long random string> docker compose up --build`.

Tests: `npm test`

## Endpoints

| Area | Endpoint | Access |
|---|---|---|
| Auth | `POST /api/auth/register`, `/login`, `/refresh`, `/logout` | public |
| | `GET /api/auth/me`, `PATCH /api/auth/me/password` | logged in |
| Reports | `GET /api/reports` search and filter verified reports | public |
| | `GET /api/reports/:id` | public if verified, otherwise owner or staff |
| | `POST /api/reports`, `GET /api/reports/mine` | logged in |
| | `PATCH /api/reports/:id`, `DELETE /api/reports/:id` | owner (admin can delete any) |
| Evidence | `POST /api/reports/:id/evidence`, `GET`/`DELETE .../evidence/:evidenceId` | owner (staff can download) |
| Community | `POST /api/reports/:id/upvote` | logged in |
| | `GET`/`POST /api/reports/:id/comments`, `DELETE /api/comments/:id` | read public, write logged in |
| Risk | `POST /api/risk/check`, `POST /api/risk/check/bulk` | public, rate limited |
| Stats | `GET /api/stats/overview` | public |
| Moderation | `GET /api/moderation/queue`, `PATCH /api/moderation/reports/:id` | moderator, admin |
| Admin | `GET /api/admin/dashboard`, `/users`, `/audit-logs`, `PATCH /users/:id/role`, `/users/:id/status` | admin |

Example risk check:

```http
POST /api/risk/check
{ "kind": "upi", "value": "refund.support@okaxis" }
```

```json
{
  "success": true,
  "data": {
    "riskScore": 62,
    "riskLevel": "high",
    "confidence": "medium",
    "summary": { "totalReports": 2, "verifiedReports": 2, "totalAmountLost": 16500, "topScamTypes": [{ "scamType": "upi_fraud", "count": 2 }] },
    "breakdown": {
      "reports": { "score": 22.4, "max": 40 },
      "financialImpact": { "score": 14.1, "max": 20 },
      "communitySignal": { "score": 6.0, "max": 10 },
      "recentMomentum": { "score": 5.0, "max": 10 },
      "identifierPatterns": { "score": 13.0, "max": 20 }
    },
    "signals": ["2 verified reports on record", "UPI ID contains words used to pose as official support: support, refund"],
    "recommendation": "Treat this as a scam. Do not share OTPs, PINs or personal details, and avoid any payment to it."
  }
}
```

(Numbers above are illustrative.)

## How the risk score works

The logic lives in `src/services/riskScoring.js` as a pure function, so it can be tested without a database. The score is the sum of five capped components:

| Component | Max | Based on |
|---|---|---|
| Reports | 40 | Number of reports, each weighted by status (verified = 1, pending = 0.35, rejected = 0) and by age (halves every 120 days) |
| Financial impact | 20 | Total amount lost, on a log scale so one huge loss does not dominate |
| Community signal | 10 | Upvotes on verified reports |
| Recent momentum | 10 | Reports filed in the last 14 days |
| Identifier patterns | 20 | Static red flags, see below |

The reports, financial and community components use diminishing returns (`1 - e^(-k*x)`), so the tenth report adds much less than the first. Levels: 0 to 29 low, 30 to 59 medium, 60 to 79 high, 80 and above critical. A separate confidence value says how much evidence stands behind the score. An identifier with no reports comes back as low risk with low confidence, and the recommendation says that is not proof of safety.

Identifier pattern checks (`src/services/riskHeuristics.js`):

- URLs: plain HTTP, raw IP host, shortener, abused TLDs, punycode, embedded credentials, scam keywords, and bank or wallet names on domains that are not the official ones
- UPI IDs: unrecognised handle, words like "refund" or "support" in the ID
- Emails: disposable domains, official-sounding names on free providers
- Phones: repeated or sequential digits, foreign country codes

## Design decisions

- **Identifiers are normalized before storage.** `+91 98765-43210`, `09876543210` and `9876543210` are the same number; URLs are matched on host only, since scammers rotate paths. This is what makes risk lookups find the right reports.
- **Hidden reports return 404, not 403**, so the API does not confirm that someone else's pending report exists.
- **Evidence files are private.** They are stored under random names, type-checked by file header rather than just the declared mime type, and only downloadable by the reporter and staff.
- **Refresh tokens are single use and stored hashed.** Presenting a used token revokes all sessions for that user.
- **Moderation changes are atomic.** The pending-to-decided transition is one conditional update, so two moderators cannot decide the same report, and moderators cannot review their own reports.
- **Request bodies are validated with Joi and unknown fields are stripped**, which prevents clients from setting fields like `role` or `status`. `express-mongo-sanitize` and `hpp` handle operator injection and parameter pollution.
- **Duplicate reports are blocked** with a unique index on reporter, identifier and scam type, plus a friendly pre-check.

## Project layout

```
server.js               entry point, graceful shutdown
src/app.js              middleware stack and route mounting
src/config/             environment validation, database connection
src/models/             Mongoose schemas and indexes
src/routes/             URL to controller mapping
src/controllers/        thin HTTP handlers
src/services/           business logic (reports, moderation, risk, stats, auth)
src/validators/         Joi schemas
src/middleware/         auth, roles, validation, uploads, rate limits, errors
src/utils/              identifier normalization, pagination, helpers
scripts/seed.js         seed data
docs/openapi.yaml       API documentation served at /api/docs
tests/unit/             unit tests for scoring, heuristics, normalization, pagination
```

## Possible extensions

Email verification and password reset, report appeals with a separate status, a scheduled job to expire stale pending reports, storing evidence in S3, and integration tests against an in-memory MongoDB.

## Demo dataset

`npm run seed:bulk` loads a repeatable dataset of 100 scam reports (79 verified, 9 pending, 12 rejected) across 32 scam campaigns, 11 scam types and all 5 identifier kinds, together with votes, comments and the audit trail of moderator decisions. It also creates 12 extra demo users (`user01@demo.scamwatch.local` to `user12@...`).

The script first clears all reports, votes, comments and audit entries so the result is always identical, and keeps user accounts. Use it on a demo database only. All identifiers in the dataset are fictional.

## Testing

```bash
npm test          # 56 unit tests: risk scoring, pattern checks, identifier normalization, dataset validity
```

An end-to-end test drives a running server and its real database through the whole product: registration, filing a report, duplicate protection, moderation, evidence upload, risk scoring before and after verification, voting, comments, admin actions, audit log, refresh token reuse detection, password change and account lockout (68 checks).

```bash
# terminal 1: rate limits off, otherwise the test trips its own limiter
DISABLE_RATE_LIMITS=true npm start        # PowerShell: $env:DISABLE_RATE_LIMITS="true"; npm start
# terminal 2
npm run test:e2e
```

`DISABLE_RATE_LIMITS` is refused when `NODE_ENV=production`. The test needs the seeded moderator and admin accounts (`npm run seed` or `npm run seed:bulk`).

## Deployment

The server also serves the demo front end, so one deployment gives a public URL for both the UI (`/`) and the API (`/api`, Swagger at `/api/docs`).

1. Push the project to GitHub (`.env` is git-ignored).
2. In MongoDB Atlas, allow network access from anywhere (`0.0.0.0/0`) because hosting platforms use changing addresses.
3. On Render, create a Web Service from the repository (`render.yaml` pre-fills the settings) and set the `MONGO_URI` environment variable. `JWT_ACCESS_SECRET` is generated automatically.
4. Load the data into the same Atlas database from your own machine with `npm run seed:bulk`. Set `SEED_ADMIN_PASSWORD` in your local `.env` first, because the seeded accounts share that password.

Notes: the free tier sleeps after 15 minutes without traffic, so open the site once before a demo. Uploaded evidence files are stored on local disk and are lost when the service restarts; use object storage for a long-lived deployment.
