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

// ---------------------------------------------------------------------------
// Account trade cache
//
// Stats, lists and charts all need the account's full trade list. Screenshots
// are stored as base64 inside trade documents and can be hundreds of KB each,
// so they are never loaded here: only `hasScreenshotBefore/After` flags are.
// The list is cached briefly and invalidated whenever trades change.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; trades: any[] }>();
const inflight = new Map<string, Promise<any[]>>();

/** Call after anything that adds, edits or deletes trades. */
export const invalidateTradeCache = () => {
  cache.clear();
};

const loadAccountTrades = async (accountNumber: string): Promise<any[]> => {
  const hit = cache.get(accountNumber);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.trades;

  const pending = inflight.get(accountNumber);
  if (pending) return pending;

  const hasValue = (field: string) => ({ $gt: [{ $strLenBytes: { $ifNull: [field, ''] } }, 0] });
  const promise = Trade.aggregate([
    { $match: { accountNumber } },
    { $addFields: { hasScreenshotBefore: hasValue('$screenshotBeforeUrl'), hasScreenshotAfter: hasValue('$screenshotAfterUrl') } },
    { $project: { screenshotBeforeUrl: 0, screenshotAfterUrl: 0 } },
    { $sort: { openTime: 1 } },
  ])
    .exec()
    .then((trades) => {
      cache.set(accountNumber, { at: Date.now(), trades });
      return trades;
    })
    .finally(() => inflight.delete(accountNumber));

  inflight.set(accountNumber, promise);
  return promise;
};

/** In-memory version of the few Mongo filters used by callers (equality, $gte/$lte/$gt/$lt). */
const matchesQuery = (doc: any, query: Record<string, any>) =>
  Object.entries(query).every(([field, cond]) => {
    const value = doc[field];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const v = value instanceof Date ? value.getTime() : value;
      const num = (x: any) => (x instanceof Date ? x.getTime() : x);
      if (cond.$gte !== undefined && !(v >= num(cond.$gte))) return false;
      if (cond.$gt !== undefined && !(v > num(cond.$gt))) return false;
      if (cond.$lte !== undefined && !(v <= num(cond.$lte))) return false;
      if (cond.$lt !== undefined && !(v < num(cond.$lt))) return false;
      return true;
    }
    return value === cond;
  });

/**
 * Loads the active account's trades and returns them as trade "units":
 * smart-grouped trades (default) or one unit per MT5 position when `raw`.
 * Units carry `hasScreenshotBefore/After` flags instead of the image data.
 */
export const loadTradeUnits = async (
  extraQuery: Record<string, any> = {},
  opts: { raw?: boolean } = {}
): Promise<TradeGroup[]> => {
  const accountNumber = await getActiveAccountNumber();
  const all = await loadAccountTrades(accountNumber);
  const trades = Object.keys(extraQuery).length ? all.filter((t) => matchesQuery(t, extraQuery)) : all;
  const window = opts.raw ? -1 : await getMergeWindow();
  return groupTrades(trades, window);
};
