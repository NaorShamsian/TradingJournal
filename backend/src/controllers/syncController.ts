import { Request, Response } from 'express';
import SyncStatus from '../models/SyncStatus';
import mongoose from 'mongoose';
import MT5Account from '../models/MT5Account';
import Trade from '../models/Trade';
import BalanceOperation from '../models/BalanceOperation';
import { runMT5Sync, isSyncRunning } from '../services/mt5Sync';

// GET /api/sync/status
export const getSyncStatus = async (req: Request, res: Response) => {
  try {
    let status = await SyncStatus.findOne();
    if (!status) {
      status = new SyncStatus({
        status: 'stopped',
        importedCount: 0,
        skippedDuplicates: 0,
        triggerManualSync: false,
      });
      await status.save();
    }
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving sync status', error: error.message });
  }
};

// POST /api/sync/status
export const updateSyncStatus = async (req: Request, res: Response) => {
  try {
    const {
      status,
      lastSyncTime,
      lastSuccessfulSyncTime,
      importedCount,
      skippedDuplicates,
      lastError,
      triggerManualSync,
      mt5AccountName,
      mt5AccountNumber,
      mt5BrokerServer,
    } = req.body;

    const updateFields: any = {};
    if (status !== undefined) updateFields.status = status;
    if (lastSyncTime !== undefined) updateFields.lastSyncTime = new Date(lastSyncTime);
    if (lastSuccessfulSyncTime !== undefined) updateFields.lastSuccessfulSyncTime = new Date(lastSuccessfulSyncTime);
    if (importedCount !== undefined) updateFields.importedCount = importedCount;
    if (skippedDuplicates !== undefined) updateFields.skippedDuplicates = skippedDuplicates;
    if (lastError !== undefined) updateFields.lastError = lastError;
    if (triggerManualSync !== undefined) updateFields.triggerManualSync = triggerManualSync;
    if (mt5AccountName !== undefined) updateFields.mt5AccountName = mt5AccountName;
    if (mt5AccountNumber !== undefined) updateFields.mt5AccountNumber = mt5AccountNumber;
    if (mt5BrokerServer !== undefined) updateFields.mt5BrokerServer = mt5BrokerServer;

    const updatedStatus = await SyncStatus.findOneAndUpdate(
      {},
      { $set: updateFields },
      { new: true, upsert: true }
    );

    res.json(updatedStatus);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating sync status', error: error.message });
  }
};

// POST /api/sync/mt5 — run a sync now (handled by the backend itself, no worker needed)
export const triggerSync = async (req: Request, res: Response) => {
  try {
    const active = await MT5Account.exists({ isActive: true });
    if (!active) {
      return res.status(400).json({ message: 'No active MT5 account profile configured.' });
    }
    const updatedStatus = await SyncStatus.findOneAndUpdate(
      {},
      { $set: { triggerManualSync: false, status: 'running', lastSyncTime: new Date() } },
      { new: true, upsert: true }
    );
    runMT5Sync('manual trigger');
    res.json({ message: 'Manual sync started', status: updatedStatus });
  } catch (error: any) {
    res.status(500).json({ message: 'Error triggering manual sync', error: error.message });
  }
};

// POST /api/sync/account-info — live account data reported by the MT5 sync script
export const updateAccountInfo = async (req: Request, res: Response) => {
  try {
    const { login, balance, equity, currency, leverage, firstDeposit, totalDeposits, totalWithdrawals } = req.body;
    const account = await MT5Account.findOne({ login: Number(login) });
    if (!account) {
      return res.status(404).json({ message: `MT5 account #${login} not found.` });
    }

    const num = (v: any) => (v === undefined || v === null ? undefined : Number(v));
    account.mt5Info = {
      balance: num(balance),
      equity: num(equity),
      currency,
      leverage: num(leverage),
      firstDeposit: num(firstDeposit),
      totalDeposits: num(totalDeposits),
      totalWithdrawals: num(totalWithdrawals),
      updatedAt: new Date(),
    };

    if (account.balanceSource === 'mt5_first_deposit' && firstDeposit) {
      account.defaultBalance = Number(firstDeposit);
    } else if (account.balanceSource === 'mt5_net_deposits' && totalDeposits !== undefined) {
      account.defaultBalance = Number((Number(totalDeposits) - Number(totalWithdrawals || 0)).toFixed(2));
    }

    await account.save();

    // Deposits / withdrawals history (used to rebuild the real balance over time)
    const ops = Array.isArray(req.body.balanceOps) ? req.body.balanceOps : [];
    if (ops.length) {
      const accountNumber = String(account.login);
      await BalanceOperation.bulkWrite(
        ops.map((op: any) => ({
          updateOne: {
            filter: { accountNumber, mt5DealId: String(op.dealId) },
            update: {
              $set: {
                accountNumber,
                mt5DealId: String(op.dealId),
                time: new Date(op.time),
                amount: Number(op.amount),
                type: Number(op.type ?? 2),
                comment: String(op.comment || ''),
              },
            },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }

    res.json({ message: 'Account info updated', defaultBalance: account.defaultBalance, balanceOps: ops.length });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating account info', error: error.message });
  }
};

// GET /api/sync/health — MongoDB connection + stored data overview
export const getHealth = async (req: Request, res: Response) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const conn = mongoose.connection;
  const connected = conn.readyState === 1;
  const mongo = { connected, state: states[conn.readyState] || 'unknown', host: conn.host, database: conn.name };
  if (!connected) {
    return res.json({ mongo, totalTrades: 0, activeAccountTrades: 0, latestTradeCloseTime: null, syncInProgress: isSyncRunning() });
  }
  try {
    const active = await MT5Account.findOne({ isActive: true });
    const accountNumber = active ? String(active.login) : 'NO_ACTIVE_ACCOUNT';
    const [totalTrades, activeAccountTrades, latest] = await Promise.all([
      Trade.countDocuments({}),
      Trade.countDocuments({ accountNumber }),
      Trade.findOne({ accountNumber }).sort({ closeTime: -1 }).select('closeTime'),
    ]);
    res.json({
      mongo,
      totalTrades,
      activeAccountTrades,
      latestTradeCloseTime: latest?.closeTime || null,
      syncInProgress: isSyncRunning(),
    });
  } catch (error: any) {
    res.status(500).json({ mongo, message: error.message });
  }
};

// GET /api/sync/active-account
export const getActiveAccountCredentials = async (req: Request, res: Response) => {
  try {
    const activeAccount = await MT5Account.findOne({ isActive: true });
    if (!activeAccount) {
      return res.status(404).json({ message: 'No active MT5 account profile configured.' });
    }
    
    // Resume from the newest trade already stored in MongoDB (the script adds an
    // overlap), so re-adding an account always re-imports its full history.
    const latest = await Trade.findOne({ accountNumber: String(activeAccount.login) })
      .sort({ closeTime: -1 })
      .select('closeTime');

    res.json({
      lastTradeCloseTime: latest ? latest.closeTime : null,
      login: activeAccount.login,
      password: activeAccount.password || '',
      server: activeAccount.server,
      path: activeAccount.path || '',
      defaultBalance: activeAccount.defaultBalance,
      riskPerTradePercent: activeAccount.riskPerTradePercent,
      syncHistoryDepth: activeAccount.syncHistoryDepth || 'all',
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving active account credentials', error: error.message });
  }
};
