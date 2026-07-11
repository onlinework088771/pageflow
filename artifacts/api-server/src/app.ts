import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
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
// The frontend build output lands at artifacts/fb-agency/dist/public relative
// to the workspace root, which is where the process runs in deployment.
if (process.env["NODE_ENV"] === "production") {
  const frontendDist = path.resolve(process.cwd(), "artifacts", "fb-agency", "dist", "public");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // SPA fallback — serve index.html for any non-API, non-file route
    app.get("*", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
    logger.info({ frontendDist }, "Serving frontend static build");
  } else {
    logger.warn({ frontendDist }, "Frontend build not found — skipping static serving");
  }
}

export default app;
