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
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);
router.use(facebookOAuthRouter);
router.use(youtubeOAuthRouter);

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

export default router;

