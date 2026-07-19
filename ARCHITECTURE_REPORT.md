# PageFlow — Complete Architecture Report
> Read-only audit. No code was modified.

---

## 1. Overall Architecture

PageFlow is a **production SaaS platform** for Facebook and YouTube automation. It is structured as a **pnpm monorepo** with a clear separation between deployable applications and shared libraries.

```
PageFlow (pnpm monorepo)
├── artifacts/
│   ├── api-server        ← Express 5 REST API (Node.js 24, TypeScript)
│   ├── fb-agency         ← React 19 + Vite frontend (Tailwind CSS, Shadcn UI)
│   └── mockup-sandbox    ← Design/component preview environment
└── lib/
    ├── db                ← PostgreSQL schema (Drizzle ORM)
    ├── api-spec          ← OpenAPI spec (openapi.yaml) — source of truth
    ├── api-zod           ← Generated Zod validation schemas (from OpenAPI)
    └── api-client-react  ← Generated React Query hooks (from OpenAPI via Orval)
```

**Runtime topology:**
- Frontend Vite dev server → port 24102 (preview at `/`)
- API server → port 8080 (serves all `/api/*` routes)
- PostgreSQL — Replit-managed, credentials injected via `DATABASE_URL`
- Docker + Nginx configured for production VPS deployment (`docker-compose.yml`, `nginx/default.conf`)

---

## 2. Folder Structure

```
/workspace
├── artifacts/
│   ├── api-server/
│   │   ├── src/
│   │   │   ├── index.ts              ← Entry point + scheduler loop
│   │   │   ├── app.ts                ← Express app, CORS, logging, error handling
│   │   │   ├── routes/               ← All API route handlers
│   │   │   │   ├── auth.ts
│   │   │   │   ├── agency.ts
│   │   │   │   ├── accounts.ts
│   │   │   │   ├── pages.ts
│   │   │   │   ├── facebook-oauth.ts
│   │   │   │   ├── post-manager.ts
│   │   │   │   ├── scheduled-videos.ts
│   │   │   │   ├── analytics.ts
│   │   │   │   ├── overview.ts
│   │   │   │   ├── youtube-accounts.ts
│   │   │   │   ├── youtube.ts
│   │   │   │   ├── youtube-automation.ts
│   │   │   │   ├── youtube-analytics.ts
│   │   │   │   ├── youtube-scheduled-videos.ts ← AI analyze endpoint lives here
│   │   │   │   ├── billing.ts
│   │   │   │   ├── team.ts
│   │   │   │   ├── api-keys.ts
│   │   │   │   ├── public-api.ts
│   │   │   │   ├── tokens.ts
│   │   │   │   └── health.ts
│   │   │   ├── middlewares/
│   │   │   │   ├── auth.ts           ← JWT + team scope resolution
│   │   │   │   └── api-key-auth.ts   ← X-API-Key header validation
│   │   │   └── services/
│   │   │       ├── facebook-poster.ts
│   │   │       ├── youtube-poster.ts
│   │   │       ├── page-automation.ts
│   │   │       ├── youtube-automation.ts
│   │   │       └── cleanup-service.ts
│   │   ├── build.mjs                 ← esbuild bundler script
│   │   └── Dockerfile
│   └── fb-agency/
│       └── src/
│           ├── main.tsx
│           ├── App.tsx               ← Router definition
│           ├── contexts/
│           │   └── auth-context.tsx
│           ├── pages/
│           │   ├── overview.tsx
│           │   ├── accounts.tsx
│           │   ├── pages/            ← Facebook pages management
│           │   ├── upload.tsx
│           │   ├── schedule.tsx
│           │   ├── analytics.tsx
│           │   ├── settings.tsx      ← Facebook BYOC wizard
│           │   ├── fb-developer-settings.tsx
│           │   ├── team.tsx
│           │   ├── billing.tsx
│           │   ├── api-keys.tsx
│           │   └── youtube/
│           │       ├── dashboard.tsx
│           │       ├── accounts.tsx
│           │       ├── automation.tsx
│           │       ├── scheduler.tsx
│           │       ├── analytics.tsx
│           │       ├── bulk-upload.tsx  ← Under development
│           │       └── developer-settings.tsx
│           ├── components/
│           │   ├── ui/               ← Shadcn UI primitives
│           │   ├── Layout.tsx
│           │   ├── ProtectedRoute.tsx
│           │   ├── ScheduleManager.tsx
│           │   └── FacebookPostPreview.tsx
│           ├── hooks/
│           │   ├── use-toast.ts
│           │   └── use-mobile.ts
│           └── lib/
│               └── utils.ts          ← cn() Tailwind merge helper
├── lib/
│   ├── db/src/schema/               ← One file per table
│   ├── api-spec/openapi.yaml
│   └── ...
├── scripts/
│   └── post-merge.sh
├── docker-compose.yml
├── nginx/default.conf
├── AUDIT_REPORT.md                  ← Pre-existing audit (30+ findings)
└── DEPLOY.md
```

---

## 3. Module Relationships

```
fb-agency (React)
    │
    ├── @workspace/api-client-react  (generated React Query hooks)
    │       └── generated from openapi.yaml via Orval
    │
    ├── @workspace/api-zod           (generated Zod schemas)
    │
    └── HTTP → api-server (Express)
                │
                ├── @workspace/db    (Drizzle ORM → PostgreSQL)
                │
                ├── Facebook Graph API  (v19.0)
                ├── YouTube Data API v3
                ├── Google OAuth 2.0
                ├── OpenAI API        (GPT-4o vision)
                ├── Stripe API        (billing)
                └── yt-dlp            (video scraping, shell process)
```

**Code generation flow:**
`lib/api-spec/openapi.yaml` → Orval → `lib/api-client-react` + `lib/api-zod`

After any API spec change, run: `pnpm --filter @workspace/api-spec run codegen`

---

## 4. Database Overview

All tables use Drizzle ORM with PostgreSQL. The schema follows a **user-scoped multi-tenant** model.

| Table | Purpose | Key FKs |
|---|---|---|
| `users` | Agency user accounts | — |
| `agency_settings` | White-label config: FB App ID/Secret, Google Client ID/Secret, backup credentials, setup wizard state | `userId → users` |
| `facebook_accounts` | Connected Facebook OAuth profiles + access tokens | `userId → users` |
| `facebook_pages` | Managed FB pages with automation config, schedule, source | `accountId → facebook_accounts` |
| `youtube_accounts` | Connected Google/YouTube OAuth profiles + refresh tokens | `userId → users` |
| `youtube_channels` | YouTube channels per Google account | `accountId → youtube_accounts` |
| `youtube_automations` | Automation settings per channel | `channelId → youtube_channels` |
| `scheduled_videos` | Manual Facebook scheduled posts (file or URL) | `userId → users` |
| `youtube_scheduled_videos` | Manual YouTube scheduled uploads (file or URL) | `userId, channelId` |
| `team_members` | Multi-user team; roles: owner/admin/member | `userId → users` |
| `subscriptions` | Stripe subscription records | `userId → users` |
| `api_keys` | External developer API keys (SHA-256 hashed) | `userId → users` |
| `magic_links` | Cross-browser OAuth link tokens | `userId → users` |
| `tokens` | Virtual token balances | `userId → users` |
| `token_transactions` | Token purchase/usage history | `userId → users` |
| `automation_logs` | Action logs (type, message, status) | `userId → users` |

**⚠️ Known issue (from AUDIT_REPORT.md DB-001):** `token_balance` has a global design — not properly scoped per user in all paths.

---

## 5. Authentication Flow

### JWT Auth (primary)
1. User calls `POST /api/auth/signup` or `POST /api/auth/login`
2. Server returns `{ token, user }` — JWT signed with `SESSION_SECRET`, expires 7 days
3. Frontend stores token in `localStorage["pf_auth_token"]` and user in `localStorage["pf_auth_user"]`
4. `AuthContext` (`auth-context.tsx`) exposes `useAuth()` with `user`, `token`, `isAuthenticated`, `login()`, `logout()`
5. `setAuthTokenGetter()` from `@workspace/api-client-react` attaches JWT to all generated hooks
6. `authFetch()` utility in `schedule-management-utils.ts` attaches `Authorization: Bearer <token>` for manual fetch calls
7. `requireAuth` middleware on the server validates JWT on every protected route

### Team Scope Middleware
- `resolveTeamScope` middleware checks if the authenticated user is a **team member**
- If yes, transparently rewrites `req.user.userId` to the **agency owner's** ID
- This allows team members to see the owner's data without any route-level changes
- Roles: `owner`, `admin`, `member` — enforced via `requireRole()`

### API Key Auth (external/public)
- `X-API-Key` header on `/api/v1/*` routes
- Key is shown once at creation; server stores SHA-256 hash only
- `api-key-auth.ts` hashes the incoming key and compares against DB

---

## 6. Facebook Architecture

### Dynamic Credential System (BYOC)
- Facebook App ID and App Secret are **NOT in `.env`**
- Stored in `agency_settings` table per user
- Server fetches credentials from DB at runtime before every OAuth operation
- This enables white-labeling: each agency owner can use their own Facebook Developer App

### Facebook OAuth Flow
```
User clicks "Connect Account"
    → GET /api/auth/facebook
        → Reads appId/appSecret from agency_settings
        → Redirects to Facebook OAuth dialog
    → Facebook redirects to /api/auth/facebook/callback
        → Exchanges code for short-lived token
        → Exchanges short-lived token for 60-day long-lived token
        → Syncs pages for this account
        → Redirects to /fb-success (shows synced page count)
```

**Magic Link flow** (cross-browser): `GET /api/auth/facebook/magic` → generates a one-time token → stored in `magic_links` table → user navigates to `/fb-connect?token=...` → verified via `POST /api/agency/magic-link/verify`

### Page Automation
- Pages have: `sourceType` (YouTube channel/TikTok/URL), `sourceIdentity`, `postsPerDay`, `scheduleLogic` (Fixed/Random), `timezone`, `timeSlots`
- `page-automation.ts` service: polls `sourceType` RSS/scrape, downloads video via `yt-dlp`, calls `facebook-poster.ts`
- `facebook-poster.ts` uploads to Facebook Graph API `/{pageId}/videos`
- AI caption generation via OpenAI is called during automation if configured

### Post Manager
- Live read of posts from Facebook Graph API (not DB)
- Supports bulk delete, permission checks, filtering/sorting

---

## 7. YouTube Architecture

### Dynamic Credential System (in migration)
- Google OAuth Client ID and Secret are stored in `agency_settings` (same table as Facebook)
- Fields: `googleClientId`, `googleClientSecret`, `backupGoogleClientId`, `backupGoogleClientSecret`
- This mirrors the Facebook BYOC architecture — **migration is in progress**
- `youtube/developer-settings.tsx` page handles credential entry with connection testing and rollback

### Google OAuth Flow
```
User clicks "Connect YouTube Account"
    → GET /api/auth/youtube
        → Reads googleClientId/Secret from agency_settings
        → Redirects to Google OAuth consent screen
    → Google redirects to /api/auth/youtube/callback
        → Exchanges code for access + refresh tokens
        → Fetches and stores channel metadata
        → Stores tokens in youtube_accounts table
```

Tokens are refreshed via stored `refreshToken` when needed.

### YouTube Automation
- Per-channel automation config in `youtube_automations` table
- Sources: YouTube channels or TikTok (scraped via `yt-dlp`)
- `youtube-automation.ts` service handles the full cycle: scrape → download → upload
- `youtube-poster.ts` handles the actual YouTube Data API v3 upload (resumable upload protocol)
- AI title/description generation available during automated uploads

### YouTube Scheduler (Manual)
- `POST /api/youtube/scheduled-videos` — file upload or URL, with AI metadata generation
- `POST /api/youtube/ai-analyze` — GPT-4o vision analyzes video frames, returns title/description/hashtags
- Bulk upload page exists (`/youtube/bulk-upload`) but is **under development**

---

## 8. Scheduler Architecture

The scheduler runs inside `src/index.ts` as a **60-second polling loop** — no job queue or external scheduler.

```
Every 60 seconds:
    runPageAutomation()       → FB page automation cycle
    runYoutubeAutomation()    → YT channel automation cycle
    runCleanupJob()           → Delete uploaded files older than 48 hours
```

**Automation cycle (Facebook):**
1. Query `facebook_pages` where `automationEnabled = true` and next post time has passed
2. For each page: scrape source (RSS/yt-dlp), select video not yet posted (`lastPostedYtVideoId`)
3. Download video to local filesystem (`uploads/`)
4. Generate AI caption (optional)
5. Upload to Facebook via Graph API
6. Update `lastPostedAt`, `lastPostedYtVideoId`, `totalPosted`
7. Log result to `automation_logs`

**Manual scheduler (Facebook + YouTube):**
- Videos queued in `scheduled_videos` / `youtube_scheduled_videos` with `status = 'pending'`
- Polling loop checks `scheduledAt <= now AND status = 'pending'`
- Posts immediately, updates status to `'posted'` or `'failed'`

**Cleanup service:** Scans `uploads/` directory, deletes files older than 48 hours. Runs every scheduler tick.

**⚠️ Known issue (from AUDIT_REPORT.md SCHED-001):** Scheduler uses an in-memory `Map` for state tracking — unbounded growth risk over time.

---

## 9. AI Architecture

| Feature | Trigger | Model | Input | Output |
|---|---|---|---|---|
| YouTube SEO metadata | `POST /api/youtube/ai-analyze` (manual) | GPT-4o (vision) | Video file frames (beginning/middle/end) | `{ title, description, hashtags }` |
| Facebook caption generation | Automation cycle (automatic) | GPT-4o | Video context + user prompt | Caption text |
| YouTube caption generation | YT automation cycle | GPT-4o | Video context | Caption text |

**Configuration:**
- API key source: `process.env.OPENAI_API_KEY` — must be set manually as a secret
- HTTP client: `axios.post` to `https://api.openai.com/v1/chat/completions`
- Timeout: 45 seconds
- Parameters: `max_tokens: 900`, `temperature: 0.7`
- Error handling: Returns 503 if key is missing; no fallback/graceful degradation

**⚠️ Note:** `OPENAI_API_KEY` is the only credential that is NOT stored in the database — it must be added as an environment secret.

---

## 10. Existing Reusable Components

### Backend (services)
| Service | Location | Reusable for |
|---|---|---|
| `facebook-poster.ts` | `services/` | Any FB video/post upload |
| `youtube-poster.ts` | `services/` | Any YT video upload |
| `page-automation.ts` | `services/` | FB source scrape + post cycle |
| `youtube-automation.ts` | `services/` | YT source scrape + upload cycle |
| `cleanup-service.ts` | `services/` | Any disk cleanup task |

### Frontend (components/UI)
| Component | Location | Purpose |
|---|---|---|
| Shadcn UI primitives | `components/ui/` | Button, Card, Dialog, Input, Badge, Tabs, Select, etc. |
| `Layout.tsx` | `components/` | Authenticated app shell (sidebar + header) |
| `ProtectedRoute.tsx` | `components/` | Route guard wrapping |
| `ScheduleManager.tsx` | `components/` | Reusable scheduling UI |
| `FacebookPostPreview.tsx` | `components/` | Post preview card |
| `authFetch()` | `schedule-management-utils.ts` | Authenticated fetch with JWT |
| `apiUrl()` | `schedule-management-utils.ts` | Constructs full API URL |
| `useAuth()` | `auth-context.tsx` | Auth state access anywhere |
| `useToast()` | `hooks/use-toast.ts` | Toast notifications |
| `useMobile()` | `hooks/use-mobile.ts` | Responsive breakpoint detection |
| `cn()` | `lib/utils.ts` | Tailwind class merging |

---

## 11. Areas That Must NEVER Be Modified

1. **`agency_settings` credential loading logic** — The dynamic BYOC system for Facebook App ID/Secret and Google Client ID/Secret. Any change breaks OAuth for all users.
2. **`facebook-oauth.ts` callback flow** — The token exchange chain (short-lived → long-lived → page sync). Breaking this disconnects Facebook accounts.
3. **`auth.ts` middleware — `resolveTeamScope`** — This rewrites `req.user.userId` for team members. Removing or altering it breaks multi-tenancy data isolation.
4. **`lib/db/src/schema/`** — Never drop columns or rename tables directly. Always use `drizzle-kit push` for dev schema changes; production schema is managed via the Replit Publish flow.
5. **`lib/api-spec/openapi.yaml`** — Source of truth for API contracts. Changing it requires running codegen and updating both `api-client-react` and `api-zod`.
6. **`youtube-poster.ts` resumable upload protocol** — YouTube's resumable upload is stateful; the implementation handles chunk management.
7. **`magic_links` token flow** — Security-sensitive cross-browser OAuth; must not change validation logic.
8. **`api-key-auth.ts` SHA-256 hashing** — Keys are shown once; changing the hash algorithm breaks all existing API keys.

---

## 12. Areas Safe for Extension

1. **New API routes** — Add new files under `src/routes/` and register in `app.ts`. Existing routes are unaffected.
2. **New database tables** — Add a new schema file under `lib/db/src/schema/`, export from `index.ts`, run `pnpm --filter @workspace/db run push`.
3. **New frontend pages** — Add under `artifacts/fb-agency/src/pages/`, register route in `App.tsx`. Layout and auth wrapping are handled centrally.
4. **New Shadcn UI components** — Drop into `components/ui/`, self-contained.
5. **AI features** — The AI call pattern in `youtube-scheduled-videos.ts` is clean and can be replicated for new AI endpoints.
6. **YouTube bulk upload** (`/youtube/bulk-upload`) — The page exists but is marked under development; safe to implement.
7. **Overview CSV export** — The button exists on `overview.tsx` but is non-functional; safe to wire up.
8. **New automation sources** — `page-automation.ts` and `youtube-automation.ts` have a `sourceType` switch; new source types can be added without touching existing logic.
9. **Public API** (`/api/v1/*`) — Adding new read endpoints here is safe; the API key middleware is already in place.

---

## 13. Technical Debt

| ID | Area | Issue | Severity |
|---|---|---|---|
| TD-001 | Scheduler | In-memory `Map` for state tracking — unbounded growth, lost on restart | High |
| TD-002 | Facebook + YouTube routes | Near-identical multer config, file storage logic, and CRUD duplicated in `scheduled-videos.ts` and `youtube-scheduled-videos.ts` | Medium |
| TD-003 | `facebook-poster.ts` | Contains YouTube utility functions (`isYouTubeUrl`, `getYouTubeMetadata`) — wrong file | Medium |
| TD-004 | Services | `facebook-poster.ts` and `youtube-poster.ts` independently implement video resolution and cleanup | Medium |
| TD-005 | Timezones | A list of timezones is hardcoded and duplicated across `pages-management.tsx` and `page-detail.tsx` | Low |
| TD-006 | `scheduled-videos.ts` | Uses `console.error` instead of the Pino logger | Low |
| TD-007 | `facebook-poster.ts` | "TEMPORARY DIAGNOSTIC LOGGING" comment — leftover debug code | Low |
| TD-008 | API URLs | `FB_API` base URL hardcoded in `facebook-poster.ts`; Google/YouTube URLs hardcoded in `youtube-poster.ts` | Low |
| TD-009 | DEPLOY.md | Recommends `drizzle-kit push` on live production DB — unsafe practice | High |
| TD-010 | Token balance | `token_balance` design has global scope issues (AUDIT_REPORT DB-001) | High |

---

## 14. Duplicate Code

| Pattern | Files | Notes |
|---|---|---|
| Multer upload config | `scheduled-videos.ts` + `youtube-scheduled-videos.ts` | Identical storage destination logic |
| File cleanup after post | `facebook-poster.ts` + `youtube-poster.ts` | Same `fs.unlink` pattern |
| Video URL resolution | Both poster services | Should be a shared `resolveVideoUrl()` utility |
| CRUD for scheduled items | Both scheduling route files | GET/POST/PUT/DELETE pattern repeated |
| Token attachment in fetch | `authFetch()` + `api-client-react` `setAuthTokenGetter()` | Two separate auth attachment mechanisms; both needed but could be unified |
| Timezone list | `pages-management.tsx` + `page-detail.tsx` | Should be a single shared constant |

---

## 15. Performance Issues

| ID | Issue | Location | Impact |
|---|---|---|---|
| PERF-001 | Unbounded in-memory `Map` in scheduler | `src/index.ts` | Memory leak over time |
| PERF-002 | 60-second polling for all automation | `src/index.ts` | Runs even when no automation is active |
| PERF-003 | Analytics: 60-second in-memory cache only | `analytics.ts` | Cache lost on restart; no persistent caching |
| PERF-004 | `yt-dlp` spawned as a child process per automation | `page-automation.ts`, `youtube-automation.ts` | No process pooling or concurrency control |
| PERF-005 | No pagination on `GET /post-manager/pages/:pageId/posts` | `post-manager.ts` | Could return large result sets from Graph API |
| PERF-006 | API build produces a 3.4MB bundle | `build.mjs` / esbuild | Large but expected given dependencies |

---

## 16. Security Concerns

| ID | Severity | Issue | Location |
|---|---|---|---|
| SEC-001 | **Critical** | JWT token passed in URL query param during FB OAuth (`/api/auth/facebook?token=<JWT>`) — tokens appear in server logs and browser history | `facebook-oauth.ts` |
| SEC-002 | **High** | No rate limiting on any endpoint — login brute force and automation endpoint DoS possible | `app.ts` |
| SEC-003 | **High** | Missing ownership checks on some resource operations (identified in AUDIT_REPORT) | Various routes |
| SEC-004 | **High** | `app.use(cors())` with no origin whitelist — any domain can make cross-origin requests | `app.ts` |
| SEC-005 | **Medium** | `SESSION_SECRET` used with `!` assertion — runtime crash if env var is missing | `facebook-oauth.ts` |
| SEC-006 | **Medium** | Global error handler passes full error objects to Express default handler — internal DB details may be logged verbosely | `app.ts` |
| SEC-007 | **Medium** | `post-manager.ts:248` returns raw `err.message` in 502 response — leaks upstream API error details to client | `post-manager.ts` |
| SEC-008 | **Low** | `trust proxy 1` set — correct for proxied environments but requires secure upstream proxy | `app.ts` |

---

## 17. UI Architecture

- **Framework:** React 19 + Vite 7
- **Styling:** Tailwind CSS 4 (utility-first)
- **Component library:** Shadcn UI (Radix UI primitives) — located in `src/components/ui/`
- **Animation:** Framer Motion
- **Icons:** Lucide React
- **Data fetching:** TanStack Query (React Query) for server state, caching, background refetch
- **Auth state:** React Context (`auth-context.tsx`) + `localStorage` persistence
- **Routing:** React Router v6 (file not confirmed, inferred from route structure)

### Layout System
- `Layout.tsx` — authenticated shell with sidebar navigation and top header; wraps all dashboard pages
- `PublicLayout` — minimal wrapper for `/login`, `/signup`, legal pages
- `ProtectedRoute` — redirects unauthenticated users to `/login`

### Page Categories
| Category | Routes |
|---|---|
| Auth | `/login`, `/signup`, `/accept-invite/:token` |
| Facebook | `/`, `/accounts`, `/pages`, `/pages/:id`, `/upload`, `/schedule`, `/analytics` |
| YouTube | `/youtube`, `/youtube/accounts`, `/youtube/automation`, `/youtube/scheduler`, `/youtube/analytics`, `/youtube/bulk-upload`, `/youtube/developer-settings` |
| Settings/Admin | `/settings`, `/settings/developer`, `/team`, `/billing`, `/api-keys` |
| Public | `/privacy`, `/terms`, `/data-deletion`, `/fb-connect`, `/fb-success` |

### State Management Pattern
- **Server state:** TanStack Query — all API data fetched via generated hooks from `@workspace/api-client-react`
- **Auth state:** React Context (global, persisted in localStorage)
- **Local UI state:** `useState` / `useReducer` within pages
- **No global client state library** (no Redux/Zustand) — intentional for simplicity

---

## 18. Recommendations

### Immediate (before new features)
1. **Add rate limiting** (`express-rate-limit`) to `/api/auth/login` and all automation-trigger endpoints — SEC-002
2. **Fix JWT-in-URL** for Facebook OAuth — pass state via session cookie or server-side state instead — SEC-001
3. **Add CORS origin whitelist** — restrict to the known frontend domain — SEC-004

### Before Scaling
4. **Replace polling scheduler** with a proper job queue (e.g., BullMQ + Redis) — PERF-002, TD-001
5. **Persist analytics cache** to DB or Redis — PERF-003
6. **Fix multi-tenancy token balance** (AUDIT_REPORT DB-001) — ensure per-user scoping

### Code Quality
7. **Extract shared uploader utility** from `scheduled-videos.ts` and `youtube-scheduled-videos.ts` — TD-002
8. **Move YouTube utilities** out of `facebook-poster.ts` into a shared utils file — TD-003
9. **Centralize timezone constant** — single export used by all pages — TD-005
10. **Complete YouTube Bulk Upload** (`/youtube/bulk-upload`) — existing page stub ready for implementation

### For New Features
11. The **BYOC credential pattern** (Facebook and YouTube) is the established architecture — all new OAuth integrations must follow this pattern (credentials stored in `agency_settings`, fetched at runtime)
12. All new API endpoints must be added to `lib/api-spec/openapi.yaml` first, then run codegen to keep the frontend hooks in sync
13. Any new scheduler work (new automation types) should hook into the existing 60-second polling loop in `src/index.ts` — or better, migrate to the job queue first

---

*Report generated: July 19, 2026. Read-only — no files were modified.*
