import app from "./app";
import { logger } from "./lib/logger";
import { runScheduler } from "./services/facebook-poster";
import { runPageAutomation } from "./services/page-automation";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function getPublicBaseUrl(): string | undefined {
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

  runScheduler(publicBaseUrl).catch(() => {});
  runPageAutomation().catch(() => {});
});
