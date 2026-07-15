import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import agencyRouter from "./agency";
import accountsRouter from "./accounts";
import pagesRouter from "./pages";
import overviewRouter from "./overview";
import tokensRouter from "./tokens";
import facebookOAuthRouter from "./facebook-oauth";
import automationLogsRouter from "./automation-logs";
import scheduledVideosRouter from "./scheduled-videos";
import youtubeRouter from "./youtube";
import analyticsRouter from "./analytics";
import postManagerRouter from "./post-manager";
import { youtubeAccountsPublicRouter, youtubeAccountsRouter } from "./youtube-accounts";
import youtubeScheduledVideosRouter from "./youtube-scheduled-videos";
import youtubeAutomationRouter from "./youtube-automation";
import youtubeAnalyticsRouter from "./youtube-analytics";
import { teamPublicRouter, teamRouter } from "./team";
import { billingPublicRouter, billingRouter } from "./billing";
import apiKeysRouter from "./api-keys";
import publicApiRouter from "./public-api";
import { requireAuth, resolveTeamScope } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);
router.use(facebookOAuthRouter);
router.use(youtubeAccountsPublicRouter);
// Team invite acceptance is unauthenticated (token-based) — mounted here, not under requireAuth.
router.use(teamPublicRouter);
// Stripe webhook must stay unauthenticated (verified via signature instead of JWT).
router.use(billingPublicRouter);
// External API-key auth (its own middleware, not JWT) for third-party integrations.
router.use(publicApiRouter);

// Protected routes — require valid JWT, then resolve team scope so shared
// team data (Phase 7) flows through every existing route unchanged.
const protect = [requireAuth, resolveTeamScope] as const;
router.use(...protect, agencyRouter);
router.use(...protect, accountsRouter);
router.use(...protect, pagesRouter);
router.use(...protect, overviewRouter);
router.use(...protect, tokensRouter);
router.use(...protect, automationLogsRouter);
router.use(...protect, scheduledVideosRouter);
router.use(...protect, youtubeRouter);
router.use(...protect, analyticsRouter);
router.use(...protect, postManagerRouter);
// youtubeAccountsRouter applies requireAuth internally too; the extra requireAuth
// here just keeps this file consistent with every other protected router.
router.use(...protect, youtubeAccountsRouter);
router.use(...protect, youtubeScheduledVideosRouter);
router.use(...protect, youtubeAutomationRouter);
router.use(...protect, youtubeAnalyticsRouter);
router.use(...protect, teamRouter);
router.use(...protect, billingRouter);
router.use(...protect, apiKeysRouter);

export default router;

