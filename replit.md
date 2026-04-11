# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: JWT (jsonwebtoken + bcryptjs), tokens stored in localStorage

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### FB Agency Dashboard (`artifacts/fb-agency`)
- **Type**: react-vite, preview at `/`
- **Purpose**: Facebook Page Automation Agency Dashboard ("PageFlow")
- **Features**:
  - **JWT Auth**: Signup (/signup) and Login (/login) pages; token stored in localStorage
  - **Protected routes**: All dashboard pages redirect to /login if not authenticated
  - **AuthContext**: `useAuth()` hook provides `user`, `login()`, `logout()`, `isAuthenticated`
  - Overview dashboard with stats cards (active pages, automation health, account health, token balance)
  - FB Accounts management — connect via real Facebook OAuth; disconnect; sync pages
  - **Pages management** (`/pages`) — card-based grid; search/filter; 2-step Add Page wizard (select account+page → configure source/schedule); uses upsert so re-adding an existing page just updates its configuration; toggle automation per card; click card to open detail
  - **Upload Scheduler** (`/upload`) — manually upload video files (MP4/MOV/AVI up to 500MB) or paste a video URL; select multiple Facebook pages via checkboxes; set exact date/time with timezone; view and delete pending scheduled uploads
  - **Page detail** (`/pages/:id`) — Overview tab (stats: posted/pending/failed, page info) + Settings tab (Automation sub-tab: postsPerDay/scheduleLogic/timezone/timeSlots; Source sub-tab; Connections sub-tab; Identity sub-tab)
  - **FB OAuth success page** (`/fb-success`) — public landing after OAuth; shows synced page count
  - **FB Connect (magic link)** (`/fb-connect?token=...`) — public landing; calls `/agency/magic-link/verify` to verify cross-browser link
  - Agency Settings with 5-step BYOC wizard (Bring Your Own Credentials) for Facebook Developer App setup
  - Token system with packages and transaction history
  - Automation logs viewer

### API Server (`artifacts/api-server`)
- Express 5 backend, serves all routes under `/api`
- **Auth routes** (public): `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- **Facebook OAuth**: `GET /api/auth/facebook` (redirect), `GET /api/auth/facebook/callback`
- **Protected routes** (require `Authorization: Bearer <JWT>`): `/api/agency/settings`, `/api/accounts`, `/api/pages`, `/api/overview/stats`, `/api/tokens`, `/api/automation-logs`
- JWT secret read from `SESSION_SECRET` environment variable
- Auth middleware: `artifacts/api-server/src/middlewares/auth.ts`

## Database Schema

- `users` — agency users (email, password_hash, name, agency_name, role)
- `agency_settings` — single-row agency config (BYOC app credentials, setup progress)
- `facebook_accounts` — connected Facebook user accounts (with OAuth access tokens)
- `facebook_pages` — managed Facebook pages (with automation settings)
- `token_balance` — single-row token balance
- `token_transactions` — token purchase/usage history
- `automation_logs` — automation action logs (type, message, page, status)

## OpenAPI + Codegen

OpenAPI spec lives at `lib/api-spec/openapi.yaml`. After changing the spec:
```
pnpm --filter @workspace/api-spec run codegen
```
This regenerates `lib/api-client-react` (React Query hooks) and `lib/api-zod` (Zod validation schemas).

## Auth Flow

1. User signs up at `/signup` or logs in at `/login`
2. API returns `{token, user}` — frontend stores token in `localStorage["pf_auth_token"]`
3. `setAuthTokenGetter()` from `@workspace/api-client-react` is called in AuthContext to attach JWT to all API requests
4. `ProtectedRoute` component checks `isAuthenticated` and redirects to `/login` if false
5. Facebook OAuth: clicking "Connect Account" redirects to `/api/auth/facebook?token=<JWT>` which redirects to Facebook, then callback at `/api/auth/facebook/callback` syncs pages
