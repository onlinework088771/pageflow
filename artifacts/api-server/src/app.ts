import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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

// In production or when built, serve the compiled Vite frontend and handle SPA fallback.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const possibleDistPaths = [
  path.resolve(__dirname, "..", "..", "fb-agency", "dist", "public"),
  path.resolve(process.cwd(), "artifacts", "fb-agency", "dist", "public"),
  path.resolve(process.cwd(), "dist", "public"),
];

let frontendDist: string | null = null;
for (const p of possibleDistPaths) {
  if (fs.existsSync(p)) {
    frontendDist = p;
    break;
  }
}

if (frontendDist) {
  app.use(express.static(frontendDist));
  app.get("*splat", (_req, res) => {
    res.sendFile(path.join(frontendDist!, "index.html"));
  });
  logger.info({ frontendDist }, "Serving frontend static build");
} else if (process.env["NODE_ENV"] !== "production") {
  try {
    const { createServer: createViteServer } = await import("vite");
    const fbAgencyDir = path.resolve(process.cwd(), "artifacts", "fb-agency");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      root: fbAgencyDir,
    });
    app.use(vite.middlewares);
    logger.info({ fbAgencyDir }, "Mounted Vite dev middleware");
  } catch (err: any) {
    logger.warn({ err: err.message }, "Vite dev middleware not loaded");
  }
}

// Shared error-handling middleware — logging only.
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
