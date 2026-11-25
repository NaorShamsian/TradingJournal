import { Router } from 'express';
import {
  getSummaryStats,
  getEquityCurve,
  getCalendarStats,
  getStatsBySymbol,
  getStatsBySession,
  getStatsByStrategy,
  getStatsByHour,
  getDrawdownStats,
  getCashflow,
} from '../controllers/statsController';

const router = Router();

router.get('/summary', getSummaryStats);
router.get('/equity-curve', getEquityCurve);
router.get('/calendar', getCalendarStats);
router.get('/by-symbol', getStatsBySymbol);
router.get('/by-session', getStatsBySession);
router.get('/by-strategy', getStatsByStrategy);
router.get('/by-hour', getStatsByHour);
router.get('/drawdown', getDrawdownStats);
router.get('/cashflow', getCashflow);

export default router;
