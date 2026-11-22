import Trade from '../models/Trade';
import Settings from '../models/Settings';
import MT5Account from '../models/MT5Account';
import { groupTrades, TradeGroup } from '../utils/tradeGrouping';

export const getActiveAccountNumber = async (): Promise<string> => {
  const active = await MT5Account.findOne({ isActive: true });
  return active ? String(active.login) : 'NO_ACTIVE_ACCOUNT';
};

/** Merge window in minutes, or -1 when smart merging is off (group by MT5 position only). */
export const getMergeWindow = async (): Promise<number> => {
  const settings = await Settings.findOne().sort({ createdAt: 1 });
  if (settings && settings.mergeTrades === false) return -1;
  return settings?.mergeWindowMinutes ?? 5;
};

/**
 * Loads the active account's trades and returns them as trade "units":
 * smart-grouped trades (default) or one unit per MT5 position when `raw`.
 */
export const loadTradeUnits = async (
  extraQuery: Record<string, any> = {},
  opts: { raw?: boolean } = {}
): Promise<TradeGroup[]> => {
  const accountNumber = await getActiveAccountNumber();
  const trades = await Trade.find({ accountNumber, ...extraQuery }).sort({ openTime: 1 }).lean();
  const window = opts.raw ? -1 : await getMergeWindow();
  return groupTrades(trades as any[], window);
};
