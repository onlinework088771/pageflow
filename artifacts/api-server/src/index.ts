import app from "./app";
import { logger } from "./lib/logger";
import { runScheduler } from "./services/facebook-poster";
import { runPageAutomation } from "./services/page-automation";
import { runCleanupJob } from "./services/cleanup-service";
import { runYouTubeAutomation } from "./services/youtube-automation";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 3000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function getPublicBaseUrl(): string | undefined {
  if (process.env["PUBLIC_BASE_URL"]) return process.env["PUBLIC_BASE_URL"];
  const domain = process.env["REPLIT_DEV_DOMAIN"] ?? process.env["REPL_SLUG"];
  if (domain) return `https://${domain}`;
  return undefined;
}

app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening on 0.0.0.0");

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

  // YouTube automation — runs every 60s, mirrors page automation for YouTube destinations
  setInterval(() => {
    runYouTubeAutomation().catch((e) =>
      logger.error({ err: e.message }, "YouTube automation error"),
    );
  }, 60_000);

  runScheduler(publicBaseUrl).catch(() => {});
  runPageAutomation().catch(() => {});
  runCleanupJob().catch(() => {});
  runYouTubeAutomation().catch(() => {});
});
