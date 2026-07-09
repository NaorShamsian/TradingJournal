import { Router } from 'express';
import {
  getTrades,
  getTradeById,
  importTrades,
  updateTrade,
  deleteTrade,
  resetDatabase,
} from '../controllers/tradesController';

const router = Router();

router.get('/', getTrades);
router.get('/:id', getTradeById);
router.post('/import', importTrades);
router.post('/reset', resetDatabase);
router.put('/:id', updateTrade);
router.delete('/:id', deleteTrade);

export default router;
