/**
 * Smart trade grouping.
 *
 * MT5 records every partial close / every scaled-in position as a separate
 * deal. Traders think in "trade ideas": several positions on the same symbol,
 * in the same direction, opened while the previous one was still running (or
 * within a few minutes of it closing) are one trade.
 *
 * Rules (applied per account):
 *   1. Exits that belong to the same MT5 position are always one trade.
 *   2. Same symbol + same direction + the position opened while the current
 *      group was still open, or within `windowMinutes` after it fully closed,
 *      joins that group.
 *
 * windowMinutes < 0 disables rule 2 (group by MT5 position only).
 */

export interface RawTrade {
  _id: any;
  positionId: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openTime: Date;
  closeTime: Date;
  entryPrice: number;
  exitPrice: number;
  profit: number;
  commission: number;
  swap: number;
  netProfit: number;
  [key: string]: any;
}

export interface TradeGroup extends RawTrade {
  isGrouped: boolean;
  positionsCount: number;
  exitsCount: number;
  memberIds: string[];
  rawExits: RawTrade[];
}

const JOURNAL_FIELDS = [
  'strategy', 'session', 'emotion', 'mistake', 'mistakeTags', 'notes', 'entryReason', 'exitReason',
  'followedRules', 'selfRating', 'screenshotBeforeUrl', 'screenshotAfterUrl', 'screenshotBeforeScale', 'screenshotAfterScale',
  // Flags used when trades are loaded without the (large) screenshot data
  'hasScreenshotBefore', 'hasScreenshotAfter',
];

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

const hasJournal = (t: RawTrade) =>
  !!(t.notes || t.entryReason || t.exitReason || t.emotion || t.screenshotBeforeUrl || t.screenshotAfterUrl ||
    t.hasScreenshotBefore || t.hasScreenshotAfter ||
    (t.strategy && t.strategy !== 'Unassigned') || (t.mistakeTags && t.mistakeTags.length));

const buildGroup = (members: RawTrade[]): TradeGroup => {
  members.sort((a, b) => +new Date(a.openTime) - +new Date(b.openTime) || +new Date(a.closeTime) - +new Date(b.closeTime));
  const lead = members[0];
  const totalVolume = members.reduce((s, t) => s + t.volume, 0);
  const vw = (key: 'entryPrice' | 'exitPrice') =>
    totalVolume > 0 ? members.reduce((s, t) => s + t[key] * t.volume, 0) / totalVolume : lead[key];
  const openTime = new Date(Math.min(...members.map((t) => +new Date(t.openTime))));
  const closeTime = new Date(Math.max(...members.map((t) => +new Date(t.closeTime))));

  // Journal data lives on the lead trade; if the user journaled a different
  // member before grouping existed, surface that one instead.
  const journalSource = hasJournal(lead) ? lead : members.find(hasJournal) || lead;
  const journal: Record<string, any> = {};
  JOURNAL_FIELDS.forEach((f) => { if (journalSource[f] !== undefined) journal[f] = journalSource[f]; });

  return {
    ...lead,
    ...journal,
    _id: String(lead._id),
    volume: round(totalVolume),
    openTime,
    closeTime,
    entryPrice: vw('entryPrice'),
    exitPrice: vw('exitPrice'),
    stopLoss: members.find((t) => t.stopLoss)?.stopLoss,
    takeProfit: members.find((t) => t.takeProfit)?.takeProfit,
    profit: round(members.reduce((s, t) => s + t.profit, 0)),
    commission: round(members.reduce((s, t) => s + t.commission, 0)),
    swap: round(members.reduce((s, t) => s + t.swap, 0)),
    netProfit: round(members.reduce((s, t) => s + t.netProfit, 0)),
    durationMinutes: Math.max(0, Math.round((+closeTime - +openTime) / 60000)),
    isGrouped: members.length > 1,
    positionsCount: new Set(members.map((t) => t.positionId)).size,
    exitsCount: members.length,
    memberIds: members.map((t) => String(t._id)),
    // Deal whose journal entry (and screenshots) the group shows
    journalSourceId: String(journalSource._id),
    rawExits: members.map((t) => ({ ...t, _id: String(t._id) })),
  };
};

export const groupTrades = (trades: RawTrade[], windowMinutes: number): TradeGroup[] => {
  const sorted = [...trades].sort((a, b) => +new Date(a.openTime) - +new Date(b.openTime));
  const windowMs = windowMinutes * 60000;

  const clusters: RawTrade[][] = [];
  const byPosition = new Map<string, RawTrade[]>();
  const openCluster = new Map<string, { members: RawTrade[]; end: number }>(); // key: symbol|type

  for (const t of sorted) {
    // Rule 1: same MT5 position
    const posCluster = t.positionId ? byPosition.get(t.positionId) : undefined;
    if (posCluster) {
      posCluster.push(t);
      const key = `${t.symbol}|${t.type}`;
      const oc = openCluster.get(key);
      if (oc && oc.members === posCluster) oc.end = Math.max(oc.end, +new Date(t.closeTime));
      continue;
    }

    // Rule 2: overlapping / adjacent same-direction positions
    const key = `${t.symbol}|${t.type}`;
    const current = openCluster.get(key);
    const open = +new Date(t.openTime);
    let target: RawTrade[];
    if (windowMinutes >= 0 && current && open <= current.end + windowMs) {
      target = current.members;
      current.members.push(t);
      current.end = Math.max(current.end, +new Date(t.closeTime));
    } else {
      target = [t];
      clusters.push(target);
      openCluster.set(key, { members: target, end: +new Date(t.closeTime) });
    }
    if (t.positionId) byPosition.set(t.positionId, target);
  }

  return clusters.map(buildGroup);
};

/** Finds the group that contains a given trade id. */
export const findGroupOf = (groups: TradeGroup[], tradeId: string) =>
  groups.find((g) => g.memberIds.includes(String(tradeId)));
