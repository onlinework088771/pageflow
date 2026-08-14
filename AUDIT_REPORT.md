# PageFlow — Security & Code Audit Report
**Date:** 2026-06-30  
**Auditor:** Replit Agent (read-only, zero code changes)  
**Scope:** Full codebase — Backend, Frontend, Database, Scheduler, Facebook Integration, Performance, Security, Docker/Deployment, Code Quality

---

## Executive Summary

PageFlow is a Facebook Page Scheduler & Automation SaaS built on a well-structured TypeScript monorepo. The architecture choices are sound, the code is generally readable, and the feature set is coherent. However, **the application has multiple critical and high-severity issues that make it unsafe for production use as-is.** The most serious problems are a broken multi-tenancy model in the token system, a missing ownership check on video deletion, an exposed OAuth callback secret in URLs, and completely open CORS. These issues alone represent significant data-integrity and security risks.

---

## Issue Catalogue

Each issue follows this format:

| Field | Value |
|---|---|
| **ID** | Unique identifier |
| **Severity** | CRITICAL / HIGH / MEDIUM / LOW |
| **Category** | Area of the codebase |
| **Location** | File(s) and line(s) |
| **Description** | What is wrong |
| **Impact** | What can go wrong in production |
| **Reproduction** | How to observe the issue |
| **Confidence** | HIGH / MEDIUM / LOW |

---

### SEC-001 — JWT Token Exposed in OAuth Callback URL

| Field | Value |
|---|---|
| **Severity** | CRITICAL |
| **Category** | Security / Authentication |
| **Location** | `artifacts/api-server/src/routes/facebook-oauth.ts` — the redirect at the end of the OAuth callback handler |
| **Description** | After a successful Facebook OAuth exchange, the server issues a JWT and redirects the browser to `<FRONTEND>/fb-success?token=<JWT>`. The token is passed as a plain query string parameter. |
| **Impact** | The JWT appears in: (1) server access logs, (2) browser history, (3) the HTTP Referer header sent to any third-party resource loaded on the success page, (4) any analytics/CDN intermediary. A passive observer or log-read attacker obtains a valid 7-day session token trivially. |
| **Reproduction** | Connect a Facebook account; inspect server logs or browser history — the full JWT is visible in the URL. |
| **Confidence** | HIGH |

---

### SEC-002 — Completely Open CORS Policy

| Field | Value |
|---|---|
| **Severity** | CRITICAL |
| **Category** | Security |
| **Location** | `artifacts/api-server/src/app.ts` — `app.use(cors())` with no options |
| **Description** | Express is configured with `cors()` and no `origin` restriction. This means any website on the internet can make cross-origin requests to the API. Combined with JWT-in-localStorage (see SEC-007), a malicious page can call authenticated endpoints if it can steal or guess the token. |
| **Impact** | Cross-origin data theft; any origin can issue credentialed requests to the API surface. |
| **Reproduction** | From any origin, issue `fetch('https://yourdomain.com/api/accounts', {headers: {Authorization: 'Bearer <token>'}})` — the browser will not block it. |
| **Confidence** | HIGH |

---

### SEC-003 — Missing Ownership Check on Scheduled-Video Delete

| Field | Value |
|---|---|
| **Severity** | CRITICAL |
| **Category** | Security / Authorization |
| **Location** | `artifacts/api-server/src/routes/scheduled-videos.ts` — DELETE `/scheduled-videos/:id` (approx. line 260) |
| **Description** | The delete handler verifies authentication (JWT present) but does **not** verify that the authenticated user owns the video identified by `:id`. It deletes the row regardless of which user's JWT is presented. |
| **Impact** | Any authenticated user can delete any other user's scheduled video by guessing or enumerating integer IDs. Data destruction attack requires only a valid (any) account. |
| **Reproduction** | (1) Log in as user A, create a scheduled video (note its integer ID). (2) Log in as user B. (3) `DELETE /api/scheduled-videos/<A's ID>` with B's token → 200 OK, video deleted. |
| **Confidence** | HIGH |

---

### SEC-004 — No Rate Limiting on Auth Endpoints

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Security |
| **Location** | `artifacts/api-server/src/routes/auth.ts` — `POST /auth/login`, `POST /auth/signup` |
| **Description** | No rate-limiting middleware (e.g. `express-rate-limit`) is applied to login or signup endpoints. There is no account lockout, CAPTCHA, or exponential backoff. |
| **Impact** | Unlimited brute-force attacks against user passwords. Credential-stuffing attacks are trivial. |
| **Reproduction** | Send `POST /api/auth/login` with a valid email and guessed passwords in a loop — no throttling occurs. |
| **Confidence** | HIGH |

---

### SEC-005 — Facebook App Secret Returned to Frontend

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Security / Data Exposure |
| **Location** | `artifacts/api-server/src/routes/agency.ts` — serialization of agency settings (GET `/agency/settings`) |
| **Description** | The `GET /agency/settings` response serializer includes `appSecret` in its output. The Facebook App Secret is a server-side credential that must never leave the backend. |
| **Impact** | Any authenticated user can retrieve the raw Facebook App Secret via `/api/agency/settings`. With the App Secret an attacker can forge user tokens, call the Facebook Graph API on behalf of the app, and revoke any user access token. |
| **Reproduction** | Log in, `GET /api/agency/settings` — the `appSecret` field is present in the JSON response. |
| **Confidence** | HIGH |

---

### SEC-006 — Agency Settings Inserted Without userId at Signup

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Security / Data Integrity |
| **Location** | `artifacts/api-server/src/routes/auth.ts` — line 49 |
| **Description** | During signup, a row is inserted into `agency_settings` as: `db.insert(agencySettingsTable).values({ agencyName }).onConflictDoNothing()`. The `userId` foreign key is not provided. The DB column is nullable, so the insert succeeds, but the row is orphaned with `user_id = NULL`. |
| **Impact** | Each new user creates an orphaned agency-settings row. The `GET /agency/settings` route likely returns the first nullable row found or returns nothing, causing new users to never see their own settings. Data cannot be cleaned up or attributed. Over time the table fills with ghost rows. |
| **Reproduction** | Register a new account; query `SELECT * FROM agency_settings WHERE user_id IS NULL` — a new unscoped row appears. |
| **Confidence** | HIGH |

---

### SEC-007 — JWT Stored in localStorage (XSS Risk)

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Security |
| **Location** | `artifacts/fb-agency/src/contexts/auth-context.tsx` — `localStorage.setItem("auth_token", ...)` |
| **Description** | Session tokens are persisted in `localStorage`, which is accessible to any JavaScript running on the page. An XSS vulnerability in any dependency or injected script yields full account takeover. |
| **Impact** | A single XSS bug anywhere in the frontend silently exfiltrates all session tokens. Since JWTs are 7-day tokens (no refresh mechanism), stolen tokens remain valid long after the XSS is patched. |
| **Reproduction** | Open browser DevTools console, run `localStorage.getItem('auth_token')` — the raw JWT is returned. |
| **Confidence** | HIGH |

---

### SEC-008 — No Security Headers (No Helmet)

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Security |
| **Location** | `artifacts/api-server/src/app.ts` |
| **Description** | The Express application does not use `helmet` or equivalent middleware. No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, or `Permissions-Policy` headers are set. |
| **Impact** | The application is vulnerable to clickjacking, MIME-sniffing attacks, and lacks defence-in-depth headers that browsers rely on to enforce security policies. |
| **Reproduction** | `curl -I https://yourdomain.com/api/health` — no security headers in the response. |
| **Confidence** | HIGH |

---

### SEC-009 — Multer Accepts All File Types (No MIME Validation)

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Security / File Upload |
| **Location** | `artifacts/api-server/src/routes/scheduled-videos.ts` — multer configuration (line 25-27) |
| **Description** | Multer is configured with only a 500 MB file size limit. There is no `fileFilter` callback to validate MIME type or file extension. Any file type — HTML, SVG, executable, PHP — is accepted and stored on disk. |
| **Impact** | Attackers can upload arbitrary files to `/uploads/`. If the upload directory is served statically (it is, via `app.use("/uploads", express.static(...))`), an uploaded HTML or SVG file is served with the browser rendering it — enabling stored XSS. Executables could be used in server-side attacks if combined with other vulnerabilities. |
| **Reproduction** | Upload a `.html` file with `<script>alert(1)</script>` via `POST /api/scheduled-videos` with a multipart form. Navigate to the returned `/uploads/<filename>.html` URL — the script executes in the browser. |
| **Confidence** | HIGH |

---

### SEC-010 — OAuth State Parameter is Base64-Only, Not HMAC-Signed

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Security / OAuth |
| **Location** | `artifacts/api-server/src/routes/facebook-oauth.ts` — state generation and verification |
| **Description** | The OAuth `state` parameter encodes user context as `base64(JSON)` without an HMAC or cryptographic signature. Any party who knows the encoding can craft a valid state value. |
| **Impact** | OAuth CSRF: an attacker can initiate their own Facebook OAuth flow, capture the `code`, and force an authenticated victim to complete the flow — binding the attacker's Facebook account to the victim's PageFlow account. |
| **Reproduction** | Construct `state = btoa(JSON.stringify({userId: <victim_id>}))`, inject it as the OAuth callback state parameter. |
| **Confidence** | MEDIUM (requires the attacker to also obtain a valid Facebook `code` for the same app, which limits exploitability) |

---

### DB-001 — Token Balance Has No User Scope (Global Singleton)

| Field | Value |
|---|---|
| **Severity** | CRITICAL |
| **Category** | Database / Multi-tenancy |
| **Location** | `lib/db/src/schema/tokens.ts`, `artifacts/api-server/src/routes/tokens.ts` |
| **Description** | `tokenBalanceTable` has no `userId` column. The token route fetches `SELECT * FROM token_balance LIMIT 1` — a single global balance shared across all users. `tokenTransactionsTable` also has no `userId` column. |
| **Impact** | All users in the system share one token balance. User A purchasing tokens instantly increases the balance visible to User B. Tokens consumed by User B are charged against User A's purchases. In a multi-tenant SaaS this is a fundamental accounting and billing integrity failure. |
| **Reproduction** | Register two accounts; buy tokens on account A; log in as account B — the same balance is shown. |
| **Confidence** | HIGH |

---

### DB-002 — agencySettingsTable.userId Is Nullable Without Application-Level Protection

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Database |
| **Location** | `lib/db/src/schema/agency.ts` line 8 |
| **Description** | `userId` is defined as `integer("user_id").references(...)` with no `.notNull()`. As shown in SEC-006, signup inserts a row with `userId = null`. Any agency-settings query that does not explicitly filter `WHERE user_id = ?` may return the first null-user row or return nothing. |
| **Impact** | Data isolation failure; orphaned rows accumulate; new users may get stale settings from another user's (or nobody's) row. |
| **Reproduction** | See SEC-006. |
| **Confidence** | HIGH |

---

### DB-003 — No Migration System — Using Drizzle Push in Production

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Database / Deployment |
| **Location** | `docker-compose.yml` line 24 — `command: pnpm --filter @workspace/db run push` |
| **Description** | Schema changes are applied via `drizzle-kit push`, which diffs the Drizzle schema against the live database and applies changes. Unlike a proper migration system, this is destructive (can drop columns/tables), has no rollback, and no migration history. |
| **Impact** | A schema change in development could silently drop production columns or tables when the migrate container runs. There is no audit trail of what schema versions have been applied. |
| **Reproduction** | Remove a column from the Drizzle schema; deploy — `push` will attempt to drop it from the production database without warning. |
| **Confidence** | HIGH |

---

### DB-004 — automationLogsTable and tokenTransactionsTable Have No userId

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Database / Multi-tenancy |
| **Location** | `lib/db/src/schema/automation-logs.ts`, `lib/db/src/schema/tokens.ts` |
| **Description** | Neither table has a `userId` foreign key. Automation logs are scoped only by `pageId` (an integer), and transactions have no attribution at all. |
| **Impact** | All users see the same logs (if the route does not filter by page ownership, which it doesn't robustly — see CQ-001). Financial transaction history is unattributable in any multi-user scenario. |
| **Reproduction** | As user A, create pages and automate posts. Log in as user B — automation logs for A's pages are visible. |
| **Confidence** | MEDIUM (depends on how the API route filters) |

---

### DB-005 — facebookPagesTable Has No Direct userId Index

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Database / Performance |
| **Location** | `lib/db/src/schema/pages.ts` |
| **Description** | Page ownership is resolved by joining `facebook_pages → facebook_accounts → users`. There is no direct `userId` denormalized column or index on `facebook_pages`. All page-ownership checks require a JOIN. |
| **Impact** | Under load with many pages and accounts, queries that must verify page ownership (e.g., the delete endpoint) will be slower than necessary. Not a problem at small scale. |
| **Reproduction** | Run `EXPLAIN ANALYZE` on any query that filters pages by user. |
| **Confidence** | LOW (performance impact only at scale) |

---

### SCHED-001 — triggeredSlots Map Grows Without Bound (Memory Leak)

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Scheduler / Memory |
| **Location** | `artifacts/api-server/src/services/page-automation.ts` — `triggeredSlots` Map |
| **Description** | `triggeredSlots` is a `Map<number, Set<string>>` used to prevent double-firing the same time-slot for a page. Entries are added when a slot triggers but are never deleted. As pages accumulate slot-firing history the Map grows indefinitely. |
| **Impact** | Long-running production instances (days/weeks) experience unbounded memory growth. Under high page counts and many slot firings, this can exhaust Node.js heap memory and crash the process. |
| **Reproduction** | Run the scheduler for an extended period and inspect `process.memoryUsage()` — heap usage grows monotonically with each slot fire. |
| **Confidence** | HIGH |

---

### SCHED-002 — No Distributed Lock — Double-Posting on Multi-Replica Deployments

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Scheduler |
| **Location** | `artifacts/api-server/src/services/page-automation.ts` — `runPageAutomation()` |
| **Description** | The scheduler uses in-process Sets/Maps (`randomInProgress`, `triggeredSlots`) to prevent double-posting. These are process-local. If the API container is scaled to more than one replica, each process runs its own scheduler independently, and the same page can be posted to by multiple replicas simultaneously. |
| **Impact** | Duplicate posts published to Facebook pages. Token waste. Potential account-level rate-limit bans from Facebook. |
| **Reproduction** | Run two instances of the API container; enable a page with automation — both instances will attempt to post at the same scheduled time. |
| **Confidence** | HIGH |

---

### SCHED-003 — Video Scheduler: No Guard Against Concurrent Scheduler Calls

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Scheduler |
| **Location** | `artifacts/api-server/src/index.ts` — video scheduler interval (every 10s), `artifacts/api-server/src/services/page-automation.ts` — page automation (every 60s) |
| **Description** | Schedulers are started with `setInterval` with no mutual-exclusion guard. If a tick takes longer than the interval (e.g., slow Facebook API, large upload), the next tick begins and could attempt to pick up the same `pending` record. The `status = 'processing'` check provides partial protection for videos, but the window between reading and updating status allows a race. |
| **Impact** | In a single-process scenario the risk is low but non-zero. Under high Facebook API latency the same video could be dispatched twice. |
| **Reproduction** | Throttle the Facebook API mock to be slow (>10s per call); observe whether the same video appears in two concurrent post attempts. |
| **Confidence** | MEDIUM |

---

### PERF-001 — analyticsCache Is an Unbounded In-Memory Map

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Performance / Memory |
| **Location** | `artifacts/api-server/src/routes/analytics.ts` — `analyticsCache` Map |
| **Description** | Analytics responses are cached in a module-level `Map` keyed by `pageId + range`. The Map has no maximum size or LRU eviction policy. Each unique page/range combination adds an entry that is never removed (no TTL-based cleanup beyond the cache value's own `fetchedAt` timestamp check). |
| **Impact** | In a multi-user, multi-page deployment the cache grows proportionally to `pages × date_ranges`. Over time this leads to excessive memory consumption in the Node.js process. |
| **Reproduction** | Rotate through many page IDs and date ranges via the analytics endpoint; observe heap growth via `process.memoryUsage()`. |
| **Confidence** | HIGH |

---

### PERF-002 — getPageToken Called Twice Per Page in Post Manager

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Performance / Facebook API |
| **Location** | `artifacts/api-server/src/routes/post-manager.ts` — approximately lines 154 and 172 |
| **Description** | For each page in the post-manager flow, `getPageToken()` (which calls the Facebook Graph API) is called twice: once to verify the token exists and once to use it. This doubles the Facebook API calls per page. |
| **Impact** | Unnecessary Facebook API usage increases latency, consumes API rate-limit quota, and increases the chance of hitting per-hour call limits on large accounts. |
| **Reproduction** | Enable verbose logging and trigger the post-manager route for a page; observe two Graph API calls to the same token endpoint per page. |
| **Confidence** | HIGH |

---

### PERF-003 — Layout Sidebar Polls /scheduled-videos Globally Every 30 Seconds

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Performance |
| **Location** | `artifacts/fb-agency/src/components/layout.tsx` — `fetchPendingCount` + `setInterval(fetchPendingCount, 30_000)` |
| **Description** | The Layout component (rendered on every authenticated page) polls `/api/scheduled-videos` every 30 seconds to update a pending-video badge. This poll is unconditional — it fires regardless of whether the user has any videos or whether they are on the scheduler page. Additionally, `upload-scheduler.tsx` itself polls every 8 seconds. |
| **Impact** | Every authenticated user generates at least 2 API requests per minute from passive navigation alone. Under 50 concurrent users that is 100+ background DB reads per minute for status badge data. |
| **Reproduction** | Open the dashboard and observe Network tab — a request to `/api/scheduled-videos` fires every 30 seconds on every page. |
| **Confidence** | HIGH |

---

### PERF-004 — Upload Scheduler Polls Every 8 Seconds Unconditionally

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Performance |
| **Location** | `artifacts/fb-agency/src/pages/upload-scheduler.tsx` — `setInterval(..., 8_000)` |
| **Description** | The upload scheduler page polls the videos endpoint every 8 seconds regardless of whether any videos are in `pending` or `processing` state. It does not use WebSocket or SSE, and does not stop polling when all videos are in terminal states. |
| **Impact** | The page generates 7-8 backend requests per minute even when there is nothing to watch, every time the user visits the page. |
| **Reproduction** | Visit the upload scheduler page with no pending videos; observe the Network tab. |
| **Confidence** | HIGH |

---

### DEPLOY-001 — api-server Dockerfile Uses --no-frozen-lockfile

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Docker / Deployment |
| **Location** | `artifacts/api-server/Dockerfile` line 11 — `RUN pnpm install --no-frozen-lockfile` |
| **Description** | The builder stage installs dependencies with `--no-frozen-lockfile`, meaning pnpm is allowed to modify the lockfile and pull updated dependency versions at build time. The frontend Dockerfile correctly uses `--frozen-lockfile`. |
| **Impact** | Production API builds may pull different (potentially breaking or vulnerable) dependency versions than were tested. Build reproducibility is broken. |
| **Reproduction** | Build the api-server Docker image at different times; the exact installed dependency tree may differ. |
| **Confidence** | HIGH |

---

### DEPLOY-002 — No HEALTHCHECK in api-server Docker Image

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Docker / Deployment |
| **Location** | `artifacts/api-server/Dockerfile` |
| **Description** | The api-server Docker image has no `HEALTHCHECK` instruction, while `docker-compose.yml` depends on the `api` service but checks health only for postgres. The `web` service has `depends_on: [api]` with no `condition: service_healthy`. |
| **Impact** | The nginx container may start and begin accepting traffic before the API server is ready to respond, resulting in 502 errors for early requests after deployment. |
| **Reproduction** | Deploy the stack; immediately send API requests — some may 502 before the Node.js server finishes startup. |
| **Confidence** | MEDIUM |

---

### DEPLOY-003 — Uploaded Video Files Stored on Local Filesystem (Not Object Storage)

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Deployment / Architecture |
| **Location** | `artifacts/api-server/src/routes/scheduled-videos.ts`, `artifacts/api-server/src/app.ts`, `docker-compose.yml` |
| **Description** | Videos are uploaded to `/app/uploads` inside the API container and served via `express.static`. The Docker Compose volume `uploads` provides persistence within a single host, but this approach does not scale horizontally, provides no CDN caching, and risks data loss if the volume is not backed up. |
| **Impact** | Impossible to scale the API to multiple replicas (each replica has its own uploads volume). No CDN delivery for large video files — all video traffic flows through the Node.js server. Volume backup is not configured in the Docker Compose file. |
| **Reproduction** | Start two API replicas; upload a video via replica 1 — replica 2 cannot serve the file. |
| **Confidence** | HIGH |

---

### DEPLOY-004 — Nginx Forwards X-Forwarded-Proto From Upstream (Not Set by Nginx)

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Deployment / Nginx |
| **Location** | `nginx/default.conf` line 16 — `proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto` |
| **Description** | Nginx passes through the `X-Forwarded-Proto` header from the upstream request rather than setting it to the scheme of the connection to Nginx (`$scheme`). If Nginx terminates TLS (which it does not in this config — a load balancer would), `$http_x_forwarded_proto` from the client would be empty or spoofed. The correct value is `proxy_set_header X-Forwarded-Proto $scheme`. |
| **Impact** | In a setup with an upstream TLS terminator forwarding to Nginx, the API backend may not correctly detect HTTPS, leading to incorrect redirect URLs or broken OAuth callback URLs. |
| **Reproduction** | Place a TLS-terminating load balancer in front of Nginx; inspect what `req.protocol` returns in the Express app. |
| **Confidence** | MEDIUM |

---

### DEPLOY-005 — Facebook App Credentials Commented Out in .env.example

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Deployment / Configuration |
| **Location** | `.env.example` lines 30-32 |
| **Description** | `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are commented out in the example env file. These are required for the core OAuth flow to work. A new operator following the setup guide will deploy without Facebook credentials configured. |
| **Impact** | Facebook OAuth will fail silently or with cryptic errors for new deployments. Not a security issue but a significant operational/UX issue during onboarding. |
| **Reproduction** | Deploy without setting `FACEBOOK_APP_ID`; attempt to connect a Facebook account — the OAuth flow will fail. |
| **Confidence** | HIGH |

---

### CQ-001 — Automation Logs pageId Filter Applied in JavaScript, Not SQL

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Code Quality |
| **Location** | `artifacts/api-server/src/routes/automation-logs.ts` line ~31 |
| **Description** | The route fetches the 50 most recent automation log rows from the database unconditionally, then filters by `pageId` in JavaScript with `Array.prototype.filter`. When a `pageId` query parameter is provided, the SQL query still returns all 50 rows regardless. |
| **Impact** | If a page has few recent logs, the effective result set after JS filtering may be far fewer than 50. Conversely, rows for other pages consume the 50-row budget. The correct fix is `WHERE page_id = ?` in the SQL query. |
| **Reproduction** | Have 50+ logs across multiple pages; request `GET /api/automation-logs?pageId=5` — logs for pageId=5 may be missing if the 50 most recent rows belong to other pages. |
| **Confidence** | HIGH |

---

### CQ-002 — Token Purchase Endpoint Has No Payment Validation

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Code Quality / Business Logic |
| **Location** | `artifacts/api-server/src/routes/tokens.ts` — `POST /tokens` |
| **Description** | The `POST /tokens` endpoint accepts an `amount` body parameter and adds it to the global balance with no payment gateway validation, webhook verification, or purchase confirmation. Any authenticated user can POST arbitrary amounts to award themselves tokens at will. |
| **Impact** | The token economy is entirely bypassable. Any user can self-award unlimited tokens with a single API call. If tokens gate premium features, those gates are trivially circumvented. |
| **Reproduction** | `POST /api/tokens` with body `{"amount": 999999}` and a valid auth token — balance increases immediately. |
| **Confidence** | HIGH |

---

### CQ-003 — Duplicate uploadsDir Creation in Two Files

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Code Quality |
| **Location** | `artifacts/api-server/src/app.ts` lines 38-41; `artifacts/api-server/src/routes/scheduled-videos.ts` lines 12-15 |
| **Description** | The logic to create the uploads directory (`if (!fs.existsSync) fs.mkdirSync`) is duplicated in both `app.ts` and `scheduled-videos.ts`. If the path ever changes, it must be updated in two places. |
| **Impact** | Low — no runtime impact, but a maintenance and consistency risk. |
| **Reproduction** | Read both files. |
| **Confidence** | HIGH |

---

### CQ-004 — Dead "Export CSV" Button in Overview

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Code Quality / UX |
| **Location** | `artifacts/fb-agency/src/pages/overview.tsx` |
| **Description** | The Overview page renders an "Export CSV" button with no `onClick` handler and no associated logic. It is a non-functional UI element. |
| **Impact** | Users clicking the button see no response and no error. Misleading UX. |
| **Reproduction** | Navigate to the Overview page; click "Export CSV" — nothing happens. |
| **Confidence** | HIGH |

---

### CQ-005 — handleReconnect in accounts.tsx Ignores accountId Parameter

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Code Quality / UX |
| **Location** | `artifacts/fb-agency/src/pages/accounts.tsx` |
| **Description** | The `handleReconnect(accountId)` function ignores its parameter and simply opens the generic "connect new account" dialog without pre-selecting or pre-filtering to the account being reconnected. |
| **Impact** | Users clicking "Reconnect" on a specific expired account are shown the generic connect flow, which may connect a completely new account rather than refreshing the expired one's token. Reconnecting will create a duplicate account entry if the user re-authenticates the same Facebook user. |
| **Reproduction** | Mark an account as expired; click Reconnect — the dialog shown is the generic connect flow. |
| **Confidence** | HIGH |

---

### CQ-006 — TIMEZONES List Hardcoded and Duplicated Across Two Pages

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Code Quality |
| **Location** | `artifacts/fb-agency/src/pages/pages-management.tsx` lines 37-41; `artifacts/fb-agency/src/pages/page-detail.tsx` lines 30-34 |
| **Description** | A 10-entry hardcoded timezone list is copy-pasted verbatim in two separate page components. |
| **Impact** | Adding or changing a supported timezone requires editing two files. Risk of the lists diverging. Should be a shared constant or use the `Intl.supportedValuesOf('timeZone')` API. |
| **Reproduction** | Read both files. |
| **Confidence** | HIGH |

---

### CQ-007 — analytics.tsx Is a 921-Line Single-File Component

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Code Quality / Maintainability |
| **Location** | `artifacts/fb-agency/src/pages/analytics.tsx` |
| **Description** | The analytics page is a single 921-line file mixing data-fetching, chart rendering, layout, and state management with no component decomposition. |
| **Impact** | High cognitive load for maintenance. Refactoring or testing any sub-section requires navigating a large monolithic file. |
| **Reproduction** | Read the file. |
| **Confidence** | HIGH |

---

### FB-001 — pino Logger Does Not Redact ?token= in Request URLs

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Facebook Integration / Logging |
| **Location** | `artifacts/api-server/src/lib/logger.ts`; `artifacts/api-server/src/routes/facebook-oauth.ts` |
| **Description** | The pino logger redacts `req.headers.authorization` and cookie headers but does not redact `req.url` or `req.query`. The OAuth callback URL contains `?token=<JWT>` (see SEC-001). Even after fixing SEC-001, during the transition period or in other query-parameter flows, tokens in URLs will be logged in plaintext. |
| **Impact** | JWT tokens appear in application logs. Log aggregation systems (Datadog, CloudWatch, etc.) will store and index them. Log access becomes equivalent to credential access. |
| **Reproduction** | Trigger the Facebook OAuth callback; check pino logs — the full URL including the token query parameter is logged. |
| **Confidence** | HIGH |

---

### FB-002 — Facebook Access Tokens Stored Unencrypted in Database

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Facebook Integration / Security |
| **Location** | `lib/db/src/schema/accounts.ts` — `accessToken: text("access_token")` |
| **Description** | Facebook user access tokens are stored as plaintext in the `facebook_accounts.access_token` column. There is no application-level encryption. |
| **Impact** | A database breach (SQL injection, direct DB access, backup exposure) immediately exposes live Facebook access tokens for all connected accounts. Attackers can post to, read from, and manage all connected Facebook pages. |
| **Reproduction** | Access the database directly; `SELECT access_token FROM facebook_accounts` — tokens are readable. |
| **Confidence** | HIGH |

---

## Score Summary

| Dimension | Score (1–10) | Rationale |
|---|---|---|
| **Security** | 2 / 10 | Two CRITICAL issues (open CORS, URL-exposed JWT + ownership bypass), four HIGH issues, multiple MEDIUM issues. No helmet, no rate limiting, secrets leaked to frontend. |
| **Code Quality** | 5 / 10 | Generally readable, well-structured TypeScript. Marred by the global token singleton, duplicated code, dead UI, and a 921-line component. |
| **Performance** | 5 / 10 | Two unbounded Maps, redundant Facebook API calls, unconditional polling from sidebar and upload page. Acceptable at small scale, problematic under load. |
| **Architecture** | 6 / 10 | Clean monorepo, OpenAPI spec, generated client, Drizzle ORM — all good choices. Undermined by the global token/balance model, no distributed locking, and local-filesystem uploads. |
| **Production Readiness** | 2 / 10 | Multi-tenancy is broken for the token system. Critical authorization bypass on delete. Secret leaked to frontend. No migrations system. Builds are not reproducible. |

---

## Production Readiness Verdict

> ### ❌ NO — Not Ready for Production

The application **must not be deployed to production** until at minimum the following are resolved:

1. **SEC-001** — Never put JWTs in redirect URLs; use a short-lived one-time code exchanged server-side, or set the token in an httpOnly cookie.
2. **SEC-002** — Restrict CORS to the known frontend origin(s).
3. **SEC-003** — Add `WHERE user_id = ?` to the DELETE handler for scheduled videos.
4. **SEC-005** — Remove `appSecret` from the agency settings API response.
5. **SEC-006** — Fix signup to insert `userId` into `agency_settings`.
6. **SEC-008** — Add `helmet()` to the Express app.
7. **SEC-009** — Add a multer `fileFilter` that whitelists video MIME types.
8. **CQ-002** — Remove (or gate behind a real payment webhook) the self-service token credit endpoint.
9. **DB-001** — Add `userId` to `tokenBalanceTable` and `tokenTransactionsTable`.
10. **DB-003** — Migrate from `drizzle push` to `drizzle-kit generate` + `drizzle-kit migrate` for production schema management.
11. **SCHED-001** — Prune the `triggeredSlots` Map (e.g., nightly or by date-key expiry).
12. **DEPLOY-001** — Change the API Dockerfile to `pnpm install --frozen-lockfile`.

The remaining MEDIUM and LOW issues represent technical debt that should be addressed in subsequent sprints but are not individually blockers if the critical/high list above is cleared.
