import { Request, Response } from 'express';
import Settings from '../models/Settings';
import MT5Account from '../models/MT5Account';

// Starting balance & risk % live on the active MT5 account, so every page
// (dashboard, stats, trades) uses the same numbers for that account.
const withActiveAccount = async (settings: any) => {
  const obj = settings.toObject();
  const active = await MT5Account.findOne({ isActive: true });
  if (active) {
    obj.defaultBalance = active.defaultBalance;
    obj.riskPerTradePercent = active.riskPerTradePercent;
    obj.balanceSource = active.balanceSource;
    obj.activeAccountId = active._id;
  }
  return obj;
};

// GET /api/settings
export const getSettings = async (req: Request, res: Response) => {
  try {
    let settings = await Settings.findOne().sort({ createdAt: 1 });
    if (!settings) {
      settings = new Settings();
      await settings.save();
    }
    res.json(await withActiveAccount(settings));
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving settings', error: error.message });
  }
};

// PUT /api/settings
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const {
      defaultBalance,
      timezone,
      currency,
      strategies,
      sessions,
      riskPerTradePercent,
      mergeTrades,
      mergeWindowMinutes,
    } = req.body;

    let settings = await Settings.findOne().sort({ createdAt: 1 });
    if (!settings) {
      settings = new Settings();
    }

    if (defaultBalance !== undefined) settings.defaultBalance = defaultBalance;
    if (timezone !== undefined) settings.timezone = timezone;
    if (currency !== undefined) settings.currency = currency;
    if (strategies !== undefined) settings.strategies = strategies;
    if (sessions !== undefined) settings.sessions = sessions;
    if (riskPerTradePercent !== undefined) settings.riskPerTradePercent = riskPerTradePercent;
    if (mergeTrades !== undefined) settings.mergeTrades = Boolean(mergeTrades);
    if (mergeWindowMinutes !== undefined) {
      const v = Number(mergeWindowMinutes);
      if (!Number.isFinite(v) || v < 0 || v > 1440) {
        return res.status(400).json({ message: 'Merge window must be between 0 and 1440 minutes.' });
      }
      settings.mergeWindowMinutes = v;
    }

    await settings.save();

    // Balance / risk edits apply to the active account
    const active = await MT5Account.findOne({ isActive: true });
    if (active) {
      let changed = false;
      if (defaultBalance !== undefined && Number(defaultBalance) !== active.defaultBalance) {
        active.defaultBalance = Number(defaultBalance);
        active.balanceSource = 'manual'; // a manual edit overrides MT5 auto-balance
        changed = true;
      }
      if (riskPerTradePercent !== undefined && Number(riskPerTradePercent) !== active.riskPerTradePercent) {
        active.riskPerTradePercent = Number(riskPerTradePercent);
        changed = true;
      }
      if (changed) await active.save();
    }

    res.json(await withActiveAccount(settings));
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating settings', error: error.message });
  }
};
