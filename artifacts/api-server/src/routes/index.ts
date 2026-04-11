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
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);
router.use(facebookOAuthRouter);

// Protected routes — require valid JWT
router.use(requireAuth, agencyRouter);
router.use(requireAuth, accountsRouter);
router.use(requireAuth, pagesRouter);
router.use(requireAuth, overviewRouter);
router.use(requireAuth, tokensRouter);
router.use(requireAuth, automationLogsRouter);

export default router;
