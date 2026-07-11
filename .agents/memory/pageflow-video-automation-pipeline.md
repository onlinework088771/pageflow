---
name: PageFlow video-automation pipeline (TikTok/YouTube/Instagram → Facebook)
description: Root cause + fix status for the yt-dlp based download/repost pipeline in artifacts/api-server/src/services/page-automation.ts; read before touching that file or debugging "automation not posting" reports.
---

## Architecture
Page automation does NOT create rows in `scheduled_videos` — it downloads and uploads to Facebook synchronously within one scheduler tick (`runFixedSchedule`/`runRandomSchedule`, polled every 60s), driven by `facebook_pages.sourceType`/`sourceIdentity`. That table is a separate manual-upload flow with its own logic.

## Known platform-level break: Instagram
Instagram now blocks all anonymous (unauthenticated) yt-dlp scraping — confirmed via direct manual yt-dlp testing (not app-specific): profile listing (`--flat-playlist`) returns `HTTP 429` instantly regardless of handle, and single-post/reel extraction returns "Instagram sent an empty media response" (yt-dlp's known auth-wall signature). This is a platform-side anti-scraping change, not a PageFlow code defect.

**Why it matters:** any future "Instagram automation broken" report is very likely this same platform block recurring, not a new regression — check logs for `kind: "auth_wall"` or `kind: "rate_limited"` tagged `profile-list`/`metadata`/`download` before assuming new code broke it.

**Fix path (already wired into the code, inactive until configured):** set `INSTAGRAM_COOKIES_FILE` (and `TIKTOK_COOKIES_FILE` if TikTok ever gets the same treatment) to a Netscape-format cookies.txt exported from a logged-in browser session. `cookiesArgsFor()` in page-automation.ts auto-injects `--cookies` when the file exists.

## YouTube/TikTok status
Both confirmed working end-to-end (profile listing, metadata, download, file-verify) via the actual production code paths, not just raw yt-dlp — traced by temporarily exporting the internal functions and invoking them directly in a throwaway esbuild-bundled script, then reverting the exports. No code defect found in either.

## Logging added
`runYtDlp()` wraps every yt-dlp invocation with step-tagged structured logs and classifies failures (`classifyYtDlpError`) into `auth_wall` / `rate_limited` / `not_found` / `unknown`, with one retry-with-backoff for `rate_limited`. Use these `step`/`kind` fields to diagnose future pipeline failures from logs alone.

## Environment note
This Replit project (dev workspace) is NOT the production deployment for this app — production runs separately via Docker on the user's own VPS (custom domain), deployed from GitHub, not from Replit Publish. Do not assume `getDeploymentInfo()` / the Replit deployment flow applies here; live production testing must happen on their VPS after they pull the fixed code from GitHub.
