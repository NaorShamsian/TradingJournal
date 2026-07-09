import { Router } from 'express';
import {
  getSyncStatus,
  updateSyncStatus,
  triggerSync,
  getActiveAccountCredentials,
} from '../controllers/syncController';

const router = Router();

router.get('/status', getSyncStatus);
router.get('/active-account', getActiveAccountCredentials);
router.post('/status', updateSyncStatus);
router.post('/mt5', triggerSync);

export default router;
