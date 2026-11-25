import { Router } from 'express';
import {
  getTrades,
  getTradeById,
  getTradeGroup,
  getTradeScreenshot,
  importTrades,
  updateTrade,
  deleteTrade,
  resetDatabase,
} from '../controllers/tradesController';
import { getTradeCandles } from '../controllers/candlesController';

const router = Router();

router.get('/', getTrades);
router.get('/:id/group', getTradeGroup);
router.get('/:id/candles', getTradeCandles);
router.get('/:id/screenshot/:kind', getTradeScreenshot);
router.get('/:id', getTradeById);
router.post('/import', importTrades);
router.post('/reset', resetDatabase);
router.put('/:id', updateTrade);
router.delete('/:id', deleteTrade);

export default router;
