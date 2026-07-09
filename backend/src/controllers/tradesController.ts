import { Request, Response } from 'express';
import Trade from '../models/Trade';
import SyncStatus from '../models/SyncStatus';
import MT5Account from '../models/MT5Account';

// GET /api/trades
export const getTrades = async (req: Request, res: Response) => {
  try {
    const {
      search,
      symbol,
      strategy,
      session,
      outcome, // 'win' | 'loss' | 'breakeven' | 'all'
      startDate,
      endDate,
      page = '1',
      limit = '50',
      sortBy = 'closeTime',
      sortOrder = 'desc',
    } = req.query;

    const activeAccount = await MT5Account.findOne({ isActive: true });
    const accountNumber = activeAccount ? String(activeAccount.login) : 'NO_ACTIVE_ACCOUNT';

    const query: any = { accountNumber };

    // Symbol filter
    if (symbol) {
      query.symbol = (symbol as string).toUpperCase();
    }

    // Strategy filter
    if (strategy) {
      query.strategy = strategy as string;
    }

    // Session filter
    if (session) {
      query.session = session as string;
    }

    // Outcome filter
    if (outcome) {
      if (outcome === 'win') {
        query.netProfit = { $gt: 0 };
      } else if (outcome === 'loss') {
        query.netProfit = { $lt: 0 };
      } else if (outcome === 'breakeven') {
        query.netProfit = 0;
      }
    }

    // Date range filter
    if (startDate || endDate) {
      query.closeTime = {};
      if (startDate) {
        query.closeTime.$gte = new Date(startDate as string);
      }
      if (endDate) {
        query.closeTime.$lte = new Date(endDate as string);
      }
    }

    // General text search
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      query.$or = [
        { symbol: searchRegex },
        { strategy: searchRegex },
        { notes: searchRegex },
        { emotion: searchRegex },
      ];
    }

    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const allowedSortFields = ['closeTime', 'openTime', 'netProfit', 'volume', 'symbol'];
    const sortField = allowedSortFields.includes(sortBy as string) ? (sortBy as string) : 'closeTime';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const trades = await Trade.find(query)
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limitNum);

    const total = await Trade.countDocuments(query);

    res.json({
      trades,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving trades', error: error.message });
  }
};

// GET /api/trades/:id
export const getTradeById = async (req: Request, res: Response) => {
  try {
    const trade = await Trade.findById(req.params.id);
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    res.json(trade);
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving trade details', error: error.message });
  }
};

// POST /api/trades/import
export const importTrades = async (req: Request, res: Response) => {
  try {
    const rawTrades = req.body;
    if (!Array.isArray(rawTrades)) {
      return res.status(400).json({ message: 'Request body must be an array of trades' });
    }

    const activeAccount = await MT5Account.findOne({ isActive: true });
    if (!activeAccount) {
      return res.status(400).json({ message: 'No active MT5 account profile configured. Please add an MT5 account first.' });
    }
    const activeAccNumber = String(activeAccount.login);

    let importedCount = 0;
    let skippedDuplicates = 0;
    const errors: string[] = [];
    const importedTrades = [];

    for (const rawTrade of rawTrades) {
      try {
        if (!rawTrade.mt5DealId) {
          errors.push('Missing mt5DealId on trade');
          continue;
        }

        // Check if trade already exists for this specific MT5 account
        const exists = await Trade.findOne({ mt5DealId: rawTrade.mt5DealId, accountNumber: activeAccNumber });
        if (exists) {
          skippedDuplicates++;
          continue;
        }

        // Calculate missing values if possible
        const profit = Number(rawTrade.profit || 0);
        const commission = Number(rawTrade.commission || 0);
        const swap = Number(rawTrade.swap || 0);
        const netProfit = Number(rawTrade.netProfit ?? (profit + commission + swap));

        const openTime = new Date(rawTrade.openTime);
        const closeTime = new Date(rawTrade.closeTime);
        const durationMinutes = rawTrade.durationMinutes ?? 
          Math.max(0, Math.round((closeTime.getTime() - openTime.getTime()) / 60000));

        // Attempt basic Risk-to-Reward (R:R) calculation if stopLoss is present
        let rr = rawTrade.rr;
        if (!rr && rawTrade.stopLoss && rawTrade.entryPrice) {
          const entry = Number(rawTrade.entryPrice);
          const sl = Number(rawTrade.stopLoss);
          const exit = Number(rawTrade.exitPrice);
          const type = rawTrade.type;

          const risk = type === 'BUY' ? (entry - sl) : (sl - entry);
          const reward = type === 'BUY' ? (exit - entry) : (entry - exit);

          if (risk > 0) {
            rr = Number((reward / risk).toFixed(2));
          }
        }

        // Create new Trade linked to active account
        const newTrade = new Trade({
          ...rawTrade,
          netProfit,
          durationMinutes,
          rr,
          openTime,
          closeTime,
          accountNumber: activeAccNumber,
        });

        await newTrade.save();
        importedTrades.push(newTrade);
        importedCount++;
      } catch (err: any) {
        errors.push(`Deal ${rawTrade.mt5DealId || 'unknown'}: ${err.message}`);
      }
    }

    // Update sync logs
    await SyncStatus.findOneAndUpdate(
      {},
      {
        status: 'running',
        lastSuccessfulSyncTime: new Date(),
        lastSyncTime: new Date(),
        $inc: {
          importedCount: importedCount,
          skippedDuplicates: skippedDuplicates,
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      importedCount,
      skippedDuplicates,
      errors,
      importedTrades,
    });
  } catch (error: any) {
    // Record error in SyncStatus
    await SyncStatus.findOneAndUpdate(
      {},
      {
        status: 'error',
        lastSyncTime: new Date(),
        lastError: error.message,
      },
      { upsert: true }
    );

    res.status(500).json({ message: 'Error importing trades', error: error.message });
  }
};

// PUT /api/trades/:id
export const updateTrade = async (req: Request, res: Response) => {
  try {
    const {
      strategy,
      session,
      emotion,
      mistake,
      mistakeTags,
      notes,
      entryReason,
      exitReason,
      followedRules,
      selfRating,
      screenshotBeforeUrl,
      screenshotAfterUrl,
      screenshotBeforeScale,
      screenshotAfterScale,
    } = req.body;

    const trade = await Trade.findById(req.params.id);
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }

    // Assign only allowed journal settings
    if (strategy !== undefined) trade.strategy = strategy;
    if (session !== undefined) trade.session = session;
    if (emotion !== undefined) trade.emotion = emotion;
    if (mistake !== undefined) trade.mistake = mistake;
    if (mistakeTags !== undefined) trade.mistakeTags = mistakeTags;
    if (notes !== undefined) trade.notes = notes;
    if (entryReason !== undefined) trade.entryReason = entryReason;
    if (exitReason !== undefined) trade.exitReason = exitReason;
    if (followedRules !== undefined) trade.followedRules = followedRules;
    if (selfRating !== undefined) trade.selfRating = selfRating;
    if (screenshotBeforeUrl !== undefined) trade.screenshotBeforeUrl = screenshotBeforeUrl;
    if (screenshotAfterUrl !== undefined) trade.screenshotAfterUrl = screenshotAfterUrl;
    if (screenshotBeforeScale !== undefined) (trade as any).screenshotBeforeScale = screenshotBeforeScale;
    if (screenshotAfterScale !== undefined) (trade as any).screenshotAfterScale = screenshotAfterScale;

    await trade.save();

    // Replicate screenshots and scale mappings for all partial exit deals sharing the same position ID and active account
    if (trade.positionId && (
      screenshotBeforeUrl !== undefined ||
      screenshotAfterUrl !== undefined ||
      screenshotBeforeScale !== undefined ||
      screenshotAfterScale !== undefined
    )) {
      await Trade.updateMany(
        { positionId: trade.positionId, accountNumber: trade.accountNumber, _id: { $ne: trade._id } },
        {
          $set: {
            screenshotBeforeUrl: trade.screenshotBeforeUrl,
            screenshotAfterUrl: trade.screenshotAfterUrl,
            screenshotBeforeScale: (trade as any).screenshotBeforeScale,
            screenshotAfterScale: (trade as any).screenshotAfterScale,
          }
        }
      );
    }

    res.json(trade);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating trade', error: error.message });
  }
};

// DELETE /api/trades/:id
export const deleteTrade = async (req: Request, res: Response) => {
  try {
    const trade = await Trade.findByIdAndDelete(req.params.id);
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    res.json({ message: 'Trade deleted successfully', id: req.params.id });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting trade', error: error.message });
  }
};

// POST /api/trades/reset
export const resetDatabase = async (req: Request, res: Response) => {
  try {
    await Trade.deleteMany({});
    await SyncStatus.deleteMany({});
    // We also delete all registered accounts to start fully fresh as requested!
    await MT5Account.deleteMany({});
    res.json({ message: 'Database reset successfully. All trades and account profiles deleted.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error resetting database', error: error.message });
  }
};
