import { Router } from 'express';
import {
  getAccounts,
  createAccount,
  setActiveAccount,
  deleteAccount,
  updateAccount,
} from '../controllers/accountsController';

const router = Router();

router.get('/', getAccounts);
router.post('/', createAccount);
router.put('/:id/active', setActiveAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);

export default router;
