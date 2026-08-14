---
name: PageFlow Architecture
description: Full codebase map for the PageFlow Facebook Page Scheduler & Automation SaaS.
---

## Monorepo Layout (pnpm workspaces)
- `artifacts/api-server/` — Express 5 backend (TypeScript, ESM, built with esbuild)
- `artifacts/fb-agency/` — React 19 + Vite frontend dashboard
- `lib/db/` — Drizzle ORM + PostgreSQL schema (shared between artifacts)
- `lib/api-spec/openapi.yaml` — Single source of truth for the API contract
- `lib/api-zod/` — Zod validators generated from OpenAPI (used in backend)
- `lib/api-client-react/` — TanStack Query hooks generated from OpenAPI (used in frontend)

## Backend Services (run at startup + on interval)
- `facebook-poster.ts` — every 10s, posts pending `scheduled_videos` where `scheduledAt <= now`
- `page-automation.ts` — every 60s, posts next video for pages with `automationEnabled=true`, `scheduleLogic=fixed`, `status=active`, matches time slots (timezone-aware)
- `cleanup-service.ts` — every 1hr, deletes old/orphan files from `/uploads`

## Backend Routes
- auth: signup, login, me (JWT-based)
- facebook-oauth: /auth/facebook, /callback, /magic, /magic-callback
- agency: settings CRUD, app-config, verify-credentials, magic-link
- accounts: CRUD, sync-pages, available-pages
- pages: CRUD, /automation patch, /source patch
- scheduled-videos: list + create (Multer file upload)
- automation-logs, overview/stats, tokens, youtube, analytics

## Database Tables (PostgreSQL + Drizzle ORM)
- `users`: id, email, passwordHash, name, agencyName, role
- `agency_settings`: userId, agencyName, appId, appSecret, privacyPolicyUrl, appConfigured, appLive, setupStep
- `facebook_accounts`: userId, fbUserId, name, email, accessToken, pagesCount, status
- `facebook_pages`: fbPageId, name, accountId, automationEnabled, sourceType, sourceIdentity, postsPerDay, scheduleLogic, timezone, timeSlots[], scrapingStatus, totalPosted/Pending/Failed, lastPostedYtVideoId
- `scheduled_videos`: userId, title, description, videoUrl, videoPath, pageIds[], scheduledAt, status, postedCount
- `automation_logs`: type, message, pageId, pageName, status
- `magic_links`: userId, token, used, expiresAt
- `token_balance` / `token_transactions`: credit system

## Frontend Pages (Wouter routing, base = import.meta.env.BASE_URL)
- / → Overview (stats dashboard)
- /accounts → Facebook accounts management + OAuth connect
- /pages → Pages list (active/paused filter)
- /pages/:id → Page detail: automation config, time slots, source
- /settings → Agency settings (BYOC FB App credentials)
- /upload → Upload Scheduler (manual video scheduling)
- /analytics → Analytics
- /fb-success, /fb-connect → OAuth result pages

## Key Environment Variables
- DATABASE_URL — PostgreSQL connection
- SESSION_SECRET — JWT signing
- PUBLIC_BASE_URL — Public URL for Facebook OAuth callback (critical)
- FRONTEND_URL — Redirect target after OAuth
- YT_DLP_PATH — Path to yt-dlp binary (default: "yt-dlp")
- AUTO_DELETE / DELETE_AFTER_HOURS — Cleanup behavior
- PORT — Server port

## Video Posting Strategy
- YouTube: RSS feed → resolve channel → pick next unseen (tracks lastPostedYtVideoId) → yt-dlp download → binary multipart to Facebook Graph API
- Instagram/TikTok: yt-dlp --flat-playlist → same download+binary flow
- Manual upload (local file): binary multipart to Facebook
- Manual upload (non-YouTube URL): pass file_url to Facebook directly

## YouTube Automation Module (added Aug 2026)
Tables: `youtube_accounts` (Google OAuth tokens, mirrors facebook_accounts), `youtube_channels` (managed channels, mirrors facebook_pages). Both in `lib/db/src/schema/youtube.ts`.

Routes (all in `artifacts/api-server/src/routes/`):
- `youtube-oauth.ts` — public: `/youtube/auth/start` + `/youtube/auth/callback` (Google OAuth2, JWT state param, same pattern as facebook-oauth)
- `youtube-accounts.ts` — protected: list/disconnect/sync-channels, exports `getRefreshedAccessToken`
- `youtube-channels.ts` — protected: full CRUD + PATCH automation + PATCH source

Service: `artifacts/api-server/src/services/youtube-automation.ts` — runs every 60s (fixed slots + random interval logic), mirrors page-automation.ts, uses YouTube Data API v3 resumable upload (2-step: POST metadata → PUT binary stream).

Shared helpers exported from `page-automation.ts`: `fetchChannelIdFromHandle`, `fetchYouTubeRssVideos`, `fetchProfileVideos`, `getVideoMetadata`, `downloadVideoToTempFile`, `getCurrentHHMM`, `timeSlotDue`, `hoursSinceLastPost`.

Frontend pages: `youtube-accounts.tsx`, `youtube-automation.tsx`, `youtube-channel-detail.tsx`. Routes: `/youtube-accounts`, `/youtube-automation`, `/youtube/:id`. Nav items added to `layout.tsx`.

Requires env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google Cloud project with YouTube Data API v3 enabled). OAuth redirect URI: `{API_BASE}/api/youtube/auth/callback`.

**Why:** This map prevents wasted exploration time and ensures changes are made in the right layer.
