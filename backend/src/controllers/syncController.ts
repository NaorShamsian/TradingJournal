import { Request, Response } from 'express';
import SyncStatus from '../models/SyncStatus';
import MT5Account from '../models/MT5Account';

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

// POST /api/sync/mt5
export const triggerSync = async (req: Request, res: Response) => {
  try {
    const updatedStatus = await SyncStatus.findOneAndUpdate(
      {},
      { 
        $set: { 
          triggerManualSync: true,
          // Let's set status to running if it was stopped/offline to show progress
          status: 'running',
          lastSyncTime: new Date()
        } 
      },
      { new: true, upsert: true }
    );
    res.json({ message: 'Manual sync triggered', status: updatedStatus });
  } catch (error: any) {
    res.status(500).json({ message: 'Error triggering manual sync', error: error.message });
  }
};

// GET /api/sync/active-account
export const getActiveAccountCredentials = async (req: Request, res: Response) => {
  try {
    const activeAccount = await MT5Account.findOne({ isActive: true });
    if (!activeAccount) {
      return res.status(404).json({ message: 'No active MT5 account profile configured.' });
    }
    
    res.json({
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
