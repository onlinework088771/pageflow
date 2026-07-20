import app from "./app";
import { logger } from "./lib/logger";
import { runScheduler } from "./services/facebook-poster";
import { runPageAutomation } from "./services/page-automation";
import { runCleanupJob } from "./services/cleanup-service";
import { runYoutubeScheduler } from "./services/youtube-poster";
import { runYoutubeAutomation } from "./services/youtube-automation";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 8080;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function getPublicBaseUrl(): string | undefined {
  // Explicit override takes priority (VPS / any non-Replit host)
  if (process.env["PUBLIC_BASE_URL"]) return process.env["PUBLIC_BASE_URL"];
  // Replit dev domain fallback
  const domain = process.env["REPLIT_DEV_DOMAIN"] ?? process.env["REPL_SLUG"];
  if (domain) return `https://${domain}`;
  return undefined;
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const publicBaseUrl = getPublicBaseUrl();
  logger.info({ publicBaseUrl }, "Scheduler starting");

  // Manual upload scheduler — runs every 10s
  setInterval(() => {
    runScheduler(publicBaseUrl).catch((e) =>
      logger.error({ err: e.message }, "Scheduler error"),
    );
  }, 10_000);

  // Page automation scheduler — runs every 60s, checks fixed-time slots
  setInterval(() => {
    runPageAutomation().catch((e) =>
      logger.error({ err: e.message }, "Page automation error"),
    );
  }, 60_000);

  // Video cleanup job — runs every 1 hour, removes old published/orphan uploads
  setInterval(() => {
    runCleanupJob().catch((e) =>
      logger.error({ err: e.message }, "Cleanup job error"),
    );
  }, 60 * 60 * 1000);

  // YouTube upload engine (Phase 4) — runs every 10s, fully independent of the
  // Facebook scheduler above: separate table, separate service, separate OAuth.
  setInterval(() => {
    runYoutubeScheduler().catch((e) =>
      logger.error({ err: e.message }, "YouTube scheduler error"),
    );
  }, 10_000);

  // YouTube automation (Phase 5) — runs every 60s, same cadence as the Facebook
  // page-automation scheduler above but fully independent: separate table,
  // separate service, no shared code paths with any Facebook file.
  setInterval(() => {
    runYoutubeAutomation().catch((e) =>
      logger.error({ err: e.message }, "YouTube automation error"),
    );
  }, 60_000);

  runScheduler(publicBaseUrl).catch(() => {});
  runPageAutomation().catch(() => {});
  runCleanupJob().catch(() => {});
  runYoutubeScheduler().catch(() => {});
  // NOTE: runYoutubeAutomation intentionally NOT called on startup.
  // The fixed-schedule logic uses exact HH:MM matching, so an immediate call
  // on server restart would fire at an arbitrary time (not the configured slot).
  // The 60s interval above handles all scheduling correctly.
});
