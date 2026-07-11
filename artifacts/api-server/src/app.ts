import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the reverse proxy (Replit's HTTPS proxy sets X-Forwarded-Proto)
// This ensures req.protocol returns "https" in production instead of "http"
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

app.use("/api", router);

// In production serve the compiled Vite frontend and handle SPA fallback.
// Anchor off import.meta.url so the path is correct regardless of cwd.
// Compiled output: artifacts/api-server/dist/index.mjs
// Frontend build:  artifacts/fb-agency/dist/public  (two dirs up, then down)
if (process.env["NODE_ENV"] === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.resolve(__dirname, "..", "..", "fb-agency", "dist", "public");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // SPA fallback — serve index.html for any non-API, non-file route
    // Express 5 requires a named wildcard parameter; bare "*" is not allowed.
    app.get("*splat", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
    logger.info({ frontendDist }, "Serving frontend static build");
  } else {
    logger.warn({ frontendDist }, "Frontend build not found — skipping static serving");
  }
}

// Shared error-handling middleware — logging only. This does not replace or
// suppress any existing logs, does not change the response, and does not
// swallow the error: it logs the complete error detail (including the
// PostgreSQL-specific fields the `pg` driver attaches to query errors) and
// then calls next(err), which forwards to Express's built-in default error
// handler — the exact same behavior that occurs today when no error
// middleware is registered at all.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(
    {
      route: req.originalUrl,
      method: req.method,
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      hint: err?.hint,
      schema: err?.schema,
      table: err?.table,
      column: err?.column,
      constraint: err?.constraint,
      stack: err?.stack,
    },
    "Unhandled error in request pipeline",
  );
  next(err);
});

export default app;
