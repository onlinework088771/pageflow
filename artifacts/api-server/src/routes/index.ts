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
import youtubeOAuthRouter from "./youtube-oauth";
import youtubeAccountsRouter from "./youtube-accounts";
import youtubeChannelsRouter from "./youtube-channels";
import youtubeAutomationRouter from "./youtube-automation";
import youtubeAnalyticsRouter from "./youtube-analytics";
import youtubeScheduledVideosRouter from "./youtube-scheduled-videos";
import apiKeysRouter from "./api-keys";
import billingRouter from "./billing";
import { teamPublicRouter, teamRouter } from "./team";
import { requireAuth, resolveTeamScope } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);
router.use(facebookOAuthRouter);
router.use(youtubeOAuthRouter);
router.use(teamPublicRouter);

// Protected routes — require valid JWT
router.use(requireAuth, agencyRouter);
router.use(requireAuth, accountsRouter);
router.use(requireAuth, pagesRouter);
router.use(requireAuth, overviewRouter);
router.use(requireAuth, tokensRouter);
router.use(requireAuth, automationLogsRouter);
router.use(requireAuth, scheduledVideosRouter);
router.use(requireAuth, youtubeRouter);
router.use(requireAuth, analyticsRouter);
router.use(requireAuth, postManagerRouter);
router.use(requireAuth, youtubeAccountsRouter);
router.use(requireAuth, youtubeChannelsRouter);

// Team-aware feature routers resolve the agency owner before querying so
// members see the same workspace while role checks remain enforced by each
// existing router.
router.use(requireAuth, resolveTeamScope, teamRouter);
router.use(requireAuth, resolveTeamScope, billingRouter);
router.use(requireAuth, resolveTeamScope, apiKeysRouter);
router.use(requireAuth, resolveTeamScope, youtubeAutomationRouter);
router.use(requireAuth, resolveTeamScope, youtubeAnalyticsRouter);
router.use(requireAuth, resolveTeamScope, youtubeScheduledVideosRouter);

export default router;

