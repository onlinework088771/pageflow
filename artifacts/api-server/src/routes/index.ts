import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agencyRouter from "./agency";
import accountsRouter from "./accounts";
import pagesRouter from "./pages";
import overviewRouter from "./overview";
import tokensRouter from "./tokens";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agencyRouter);
router.use(accountsRouter);
router.use(pagesRouter);
router.use(overviewRouter);
router.use(tokensRouter);

export default router;
