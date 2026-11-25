import { Request, Response } from 'express';
import Trade from '../models/Trade';
import SyncStatus from '../models/SyncStatus';
import MT5Account from '../models/MT5Account';
import { loadTradeUnits, invalidateTradeCache } from '../services/tradeUnits';
import { findGroupOf } from '../utils/tradeGrouping';

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

    // Trades are returned as smart-grouped units (see utils/tradeGrouping.ts).
    // ?grouped=false returns one unit per MT5 position instead.
    const raw = req.query.grouped === 'false';

    // Symbol + date range narrow the DB query; everything else filters the
    // grouped units so a group is never split by a filter.
    const query: any = {};
    if (symbol) query.symbol = (symbol as string).toUpperCase();
    if (startDate || endDate) {
      query.closeTime = {};
      if (startDate) query.closeTime.$gte = new Date(startDate as string);
      if (endDate) query.closeTime.$lte = new Date(endDate as string);
    }

    let units = await loadTradeUnits(query, { raw });

    if (strategy) units = units.filter((u) => u.strategy === strategy);
    if (session) units = units.filter((u) => u.session === session);
    if (outcome === 'win') units = units.filter((u) => u.netProfit > 0);
    else if (outcome === 'loss') units = units.filter((u) => u.netProfit < 0);
    else if (outcome === 'breakeven') units = units.filter((u) => u.netProfit === 0);
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      units = units.filter((u) => [u.symbol, u.strategy, u.notes, u.emotion].some((v) => v && rx.test(String(v))));
    }

    // Sorting
    const allowedSortFields = ['closeTime', 'openTime', 'netProfit', 'volume', 'symbol'];
    const sortField = allowedSortFields.includes(sortBy as string) ? (sortBy as string) : 'closeTime';
    const dir = sortOrder === 'asc' ? 1 : -1;
    units.sort((a: any, b: any) => {
      const av = a[sortField] instanceof Date ? +a[sortField] : a[sortField];
      const bv = b[sortField] instanceof Date ? +b[sortField] : b[sortField];
      return av < bv ? -dir : av > bv ? dir : 0;
    });

    // Pagination
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit as string, 10) || 50);
    const total = units.length;
    // Screenshots are served by a separate, browser-cached endpoint instead of
    // being embedded (base64) in every list response.
    const base = `${req.protocol}://${req.get('host')}/api/trades`;
    const trades = units.slice((pageNum - 1) * limitNum, pageNum * limitNum).map((u: any) => {
      const src = u.journalSourceId || u._id;
      const v = u.updatedAt ? `?v=${+new Date(u.updatedAt)}` : '';
      return {
        ...u,
        screenshotBeforeUrl: u.hasScreenshotBefore ? `${base}/${src}/screenshot/before${v}` : undefined,
        screenshotAfterUrl: u.hasScreenshotAfter ? `${base}/${src}/screenshot/after${v}` : undefined,
      };
    });

    res.json({
      trades,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        rawPositions: units.reduce((s, u) => s + u.positionsCount, 0),
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
    invalidateTradeCache(); // journal may have been copied to other deals above
    res.json(trade);
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving trade details', error: error.message });
  }
};

// GET /api/trades/:id/group — the smart-grouped trade that contains this deal
export const getTradeGroup = async (req: Request, res: Response) => {
  try {
    const trade = await Trade.findById(req.params.id).select('-screenshotBeforeUrl -screenshotAfterUrl').lean();
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    // Load a window around the trade so neighbouring positions can be grouped
    const pad = 3 * 24 * 3600 * 1000;
    const units = await loadTradeUnits(
      {
        symbol: trade.symbol,
        openTime: { $lte: new Date(+trade.closeTime + pad) },
        closeTime: { $gte: new Date(+trade.openTime - pad) },
      },
      { raw: req.query.grouped === 'false' }
    );
    const group: any = findGroupOf(units, String(trade._id));
    if (!group) {
      return res.status(404).json({ message: 'Trade group not found' });
    }
    // The trade page edits screenshots, so it gets the real image data
    if (group.hasScreenshotBefore || group.hasScreenshotAfter) {
      const shots = await Trade.findById(group.journalSourceId || group._id)
        .select('screenshotBeforeUrl screenshotAfterUrl')
        .lean();
      group.screenshotBeforeUrl = shots?.screenshotBeforeUrl || '';
      group.screenshotAfterUrl = shots?.screenshotAfterUrl || '';
    }
    res.json(group);
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving trade group', error: error.message });
  }
};

// GET /api/trades/:id/screenshot/:kind — the image itself (browser-cached)
export const getTradeScreenshot = async (req: Request, res: Response) => {
  try {
    const kind = req.params.kind === 'before' ? 'screenshotBeforeUrl' : req.params.kind === 'after' ? 'screenshotAfterUrl' : null;
    if (!kind) return res.status(400).json({ message: 'Screenshot kind must be "before" or "after"' });

    const doc: any = await Trade.findById(req.params.id).select(kind).lean();
    const value: string | undefined = doc?.[kind];
    if (!value) return res.status(404).json({ message: 'Screenshot not found' });

    // Manually entered image links are just redirected to
    if (/^https?:\/\//i.test(value)) return res.redirect(value);

    const match = /^data:([^;,]+);base64,(.*)$/s.exec(value);
    if (!match) return res.status(415).json({ message: 'Unsupported screenshot format' });

    // URLs carry ?v=<updatedAt>, so a changed screenshot gets a new URL
    res.set('Content-Type', match[1]);
    res.set('Cache-Control', 'private, max-age=604800, immutable');
    res.send(Buffer.from(match[2], 'base64'));
  } catch (error: any) {
    res.status(500).json({ message: 'Error loading screenshot', error: error.message });
  }
};

// POST /api/trades/import
export const importTrades = async (req: Request, res: Response) => {
  try {
    const rawTrades = req.body;
    if (!Array.isArray(rawTrades)) {
      return res.status(400).json({ message: 'Request body must be an array of trades' });
    }

    // The sync script passes ?account=<login> so trades are always attached to the
    // account they were pulled from, even if the active account changes mid-sync.
    const requested = req.query.account ? Number(req.query.account) : null;
    const activeAccount = requested
      ? await MT5Account.findOne({ login: requested })
      : await MT5Account.findOne({ isActive: true });
    if (!activeAccount) {
      return res.status(400).json({ message: 'No matching MT5 account profile configured. Please add an MT5 account first.' });
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

    if (importedCount > 0) invalidateTradeCache();

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
    invalidateTradeCache();

    // Smart-grouped trade: copy the journal entry to every member deal so
    // filters and per-strategy stats stay consistent.
    const applyTo: string[] = Array.isArray(req.body.applyTo) ? req.body.applyTo.map(String) : [];
    const otherIds = applyTo.filter((x) => x !== String(trade._id));
    if (otherIds.length > 0) {
      const journal: Record<string, any> = {};
      [
        'strategy', 'session', 'emotion', 'mistake', 'mistakeTags', 'notes', 'entryReason', 'exitReason',
        'followedRules', 'selfRating', 'screenshotBeforeUrl', 'screenshotAfterUrl', 'screenshotBeforeScale', 'screenshotAfterScale',
      ].forEach((f) => {
        const v = (trade as any)[f];
        if (v !== undefined) journal[f] = v;
      });
      await Trade.updateMany(
        { _id: { $in: otherIds }, accountNumber: trade.accountNumber },
        { $set: journal }
      );
    } else if (trade.positionId && (
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
    // ?ids=a,b,c deletes the other deals of a grouped trade as well
    const extraIds = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
    let deleted = 1;
    if (extraIds.length) {
      const r = await Trade.deleteMany({ _id: { $in: extraIds }, accountNumber: trade.accountNumber });
      deleted += r.deletedCount || 0;
    }
    invalidateTradeCache();
    res.json({ message: 'Trade deleted successfully', id: req.params.id, deleted });
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
    invalidateTradeCache();
    res.json({ message: 'Database reset successfully. All trades and account profiles deleted.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error resetting database', error: error.message });
  }
};
