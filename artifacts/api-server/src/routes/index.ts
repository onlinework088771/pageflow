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
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);
router.use(facebookOAuthRouter);
router.use(youtubeAccountsPublicRouter);

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
// youtubeAccountsRouter applies requireAuth internally too; the extra requireAuth
// here just keeps this file consistent with every other protected router.
router.use(requireAuth, youtubeAccountsRouter);
router.use(requireAuth, youtubeScheduledVideosRouter);
router.use(requireAuth, youtubeAutomationRouter);

export default router;
