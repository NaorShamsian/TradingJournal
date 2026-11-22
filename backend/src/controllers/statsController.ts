import { Request, Response } from 'express';
import MT5Account from '../models/MT5Account';
import BalanceOperation from '../models/BalanceOperation';
import { loadTradeUnits, getActiveAccountNumber } from '../services/tradeUnits';
import { TradeGroup } from '../utils/tradeGrouping';

// All statistics are computed over trade "units": smart-grouped trades (several
// MT5 positions that form one trade idea count as one trade). Pass ?raw=true to
// compute per MT5 position instead.

const getInitialBalance = async (): Promise<number> => {
  try {
    const activeAccount = await MT5Account.findOne({ isActive: true });
    return activeAccount ? activeAccount.defaultBalance : 25000;
  } catch {
    return 25000;
  }
};

const unitsFor = async (req: Request): Promise<TradeGroup[]> => {
  const units = await loadTradeUnits({}, { raw: req.query.raw === 'true' });
  return units.sort((a, b) => +new Date(a.closeTime) - +new Date(b.closeTime));
};

const dayKey = (d: Date) => new Date(d).toISOString().split('T')[0];

interface Bucket {
  totalTrades: number;
  netProfit: number;
  winCount: number;
  lossCount: number;
  totalVolume: number;
  totalRR: number;
  rrCount: number;
}

const bucketize = (units: TradeGroup[], keyOf: (u: TradeGroup) => string | number) => {
  const map = new Map<string | number, Bucket>();
  units.forEach((u) => {
    const k = keyOf(u);
    const b = map.get(k) || { totalTrades: 0, netProfit: 0, winCount: 0, lossCount: 0, totalVolume: 0, totalRR: 0, rrCount: 0 };
    b.totalTrades++;
    b.netProfit += u.netProfit;
    if (u.netProfit > 0) b.winCount++;
    else if (u.netProfit < 0) b.lossCount++;
    b.totalVolume += u.volume;
    if (u.rr !== undefined && u.rr > 0) {
      b.totalRR += u.rr;
      b.rrCount++;
    }
    map.set(k, b);
  });
  return map;
};

const winRateOf = (b: Bucket) => (b.totalTrades > 0 ? (b.winCount / b.totalTrades) * 100 : 0);

// GET /api/stats/summary
export const getSummaryStats = async (req: Request, res: Response) => {
  try {
    const initialBalance = await getInitialBalance();
    const trades = await unitsFor(req);

    if (trades.length === 0) {
      return res.json({
        totalNetPnL: 0, winRate: 0, profitFactor: 0, totalTrades: 0, winCount: 0, lossCount: 0,
        breakevenCount: 0, averageWin: 0, averageLoss: 0, averageRR: 0, maxDrawdownAmount: 0,
        maxDrawdownPercent: 0, bestDay: 0, worstDay: 0, thisWeekPnL: 0, thisMonthPnL: 0,
        currentBalance: initialBalance, rawPositions: 0,
      });
    }

    let totalNetPnL = 0;
    let winCount = 0;
    let lossCount = 0;
    let breakevenCount = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalRR = 0;
    let rrCount = 0;
    let currentBalance = initialBalance;
    let peak = initialBalance;
    let maxDrawdownAmount = 0;
    let maxDrawdownPercent = 0;
    const dailyPnLMap: { [key: string]: number } = {};

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let thisWeekPnL = 0;
    let thisMonthPnL = 0;

    trades.forEach((trade) => {
      totalNetPnL += trade.netProfit;
      currentBalance += trade.netProfit;

      if (currentBalance > peak) peak = currentBalance;
      const drawdownAmt = peak - currentBalance;
      const drawdownPct = peak > 0 ? (drawdownAmt / peak) * 100 : 0;
      if (drawdownAmt > maxDrawdownAmount) maxDrawdownAmount = drawdownAmt;
      if (drawdownPct > maxDrawdownPercent) maxDrawdownPercent = drawdownPct;

      if (trade.netProfit > 0) {
        winCount++;
        grossProfit += trade.netProfit;
      } else if (trade.netProfit < 0) {
        lossCount++;
        grossLoss += Math.abs(trade.netProfit);
      } else {
        breakevenCount++;
      }

      if (trade.rr !== undefined && trade.rr > 0) {
        totalRR += trade.rr;
        rrCount++;
      }

      const key = dayKey(trade.closeTime);
      dailyPnLMap[key] = (dailyPnLMap[key] || 0) + trade.netProfit;

      const closeDate = new Date(trade.closeTime);
      if (closeDate >= startOfWeek) thisWeekPnL += trade.netProfit;
      if (closeDate >= startOfMonth) thisMonthPnL += trade.netProfit;
    });

    const totalTrades = trades.length;
    const dailyPnLs = Object.values(dailyPnLMap);

    res.json({
      totalNetPnL,
      winRate: Number(((winCount / totalTrades) * 100).toFixed(2)),
      profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : Number(grossProfit.toFixed(2)),
      totalTrades,
      winCount,
      lossCount,
      breakevenCount,
      averageWin: winCount > 0 ? Number((grossProfit / winCount).toFixed(2)) : 0,
      averageLoss: lossCount > 0 ? Number((grossLoss / lossCount).toFixed(2)) : 0,
      averageRR: rrCount > 0 ? Number((totalRR / rrCount).toFixed(2)) : 0,
      maxDrawdownAmount: Number(maxDrawdownAmount.toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
      bestDay: dailyPnLs.length ? Number(Math.max(...dailyPnLs).toFixed(2)) : 0,
      worstDay: dailyPnLs.length ? Number(Math.min(...dailyPnLs).toFixed(2)) : 0,
      thisWeekPnL: Number(thisWeekPnL.toFixed(2)),
      thisMonthPnL: Number(thisMonthPnL.toFixed(2)),
      currentBalance: Number(currentBalance.toFixed(2)),
      rawPositions: trades.reduce((s, t) => s + t.positionsCount, 0),
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating summary stats', error: error.message });
  }
};

// GET /api/stats/equity-curve
export const getEquityCurve = async (req: Request, res: Response) => {
  try {
    const initialBalance = await getInitialBalance();
    const trades = await unitsFor(req);

    let currentBalance = initialBalance;
    const curve = trades.map((trade, index) => {
      currentBalance += trade.netProfit;
      return {
        tradeIndex: index + 1,
        date: trade.closeTime,
        symbol: trade.symbol,
        netProfit: trade.netProfit,
        equity: currentBalance,
        positionsCount: trade.positionsCount,
      };
    });

    // Deposits / withdrawals: with these the client can rebuild the real
    // account balance at the start and end of any time range.
    const accountNumber = await getActiveAccountNumber();
    const ops = await BalanceOperation.find({ accountNumber }).sort({ time: 1 }).lean();

    res.json({
      initialBalance,
      curve: [
        { tradeIndex: 0, date: trades[0]?.openTime || new Date(Date.now() - 86400000 * 30), symbol: 'START', netProfit: 0, equity: initialBalance },
        ...curve,
      ],
      hasBalanceHistory: ops.length > 0,
      balanceOps: ops.map((o) => ({ time: o.time, amount: o.amount, comment: o.comment })),
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating equity curve', error: error.message });
  }
};

// GET /api/stats/calendar
export const getCalendarStats = async (req: Request, res: Response) => {
  try {
    const trades = await unitsFor(req);
    const map = bucketize(trades, (u) => dayKey(u.closeTime));
    const calendar = Array.from(map.entries())
      .map(([day, b]) => ({ _id: day, netProfit: b.netProfit, tradeCount: b.totalTrades, winCount: b.winCount, lossCount: b.lossCount }))
      .sort((a, b) => (a._id < b._id ? -1 : 1));
    res.json(calendar);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating calendar stats', error: error.message });
  }
};

// GET /api/stats/by-symbol
export const getStatsBySymbol = async (req: Request, res: Response) => {
  try {
    const trades = await unitsFor(req);
    const stats = Array.from(bucketize(trades, (u) => u.symbol).entries())
      .map(([symbol, b]) => ({
        _id: symbol,
        symbol,
        totalTrades: b.totalTrades,
        netProfit: b.netProfit,
        winRate: winRateOf(b),
        averageProfit: b.netProfit / b.totalTrades,
        totalVolume: b.totalVolume,
      }))
      .sort((a, b) => b.netProfit - a.netProfit);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating stats by symbol', error: error.message });
  }
};

// GET /api/stats/by-session
export const getStatsBySession = async (req: Request, res: Response) => {
  try {
    const trades = await unitsFor(req);
    const stats = Array.from(bucketize(trades, (u) => u.session || 'Other').entries())
      .map(([session, b]) => ({ _id: session, session, totalTrades: b.totalTrades, netProfit: b.netProfit, winRate: winRateOf(b) }))
      .sort((a, b) => b.netProfit - a.netProfit);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating stats by session', error: error.message });
  }
};

// GET /api/stats/by-strategy
export const getStatsByStrategy = async (req: Request, res: Response) => {
  try {
    const trades = await unitsFor(req);
    const stats = Array.from(bucketize(trades, (u) => u.strategy || 'Unassigned').entries())
      .map(([strategy, b]) => ({
        _id: strategy,
        strategy,
        totalTrades: b.totalTrades,
        netProfit: b.netProfit,
        winRate: winRateOf(b),
        avgRR: b.rrCount > 0 ? b.totalRR / b.rrCount : 0,
      }))
      .sort((a, b) => b.netProfit - a.netProfit);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating stats by strategy', error: error.message });
  }
};

// GET /api/stats/by-hour
export const getStatsByHour = async (req: Request, res: Response) => {
  try {
    const trades = await unitsFor(req);
    const stats = Array.from(bucketize(trades, (u) => new Date(u.closeTime).getUTCHours()).entries())
      .map(([hour, b]) => ({ _id: hour, hour, totalTrades: b.totalTrades, netProfit: b.netProfit, winRate: winRateOf(b) }))
      .sort((a, b) => (a.hour as number) - (b.hour as number));
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating stats by hour', error: error.message });
  }
};

// GET /api/stats/drawdown
export const getDrawdownStats = async (req: Request, res: Response) => {
  try {
    const initialBalance = await getInitialBalance();
    const trades = await unitsFor(req);

    let currentBalance = initialBalance;
    let peak = initialBalance;
    const drawdowns = trades.map((trade) => {
      currentBalance += trade.netProfit;
      if (currentBalance > peak) peak = currentBalance;
      const drawdownAmount = peak - currentBalance;
      return {
        date: trade.closeTime,
        balance: currentBalance,
        peak,
        drawdownAmount,
        drawdownPercent: peak > 0 ? (drawdownAmount / peak) * 100 : 0,
      };
    });

    res.json(drawdowns);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating drawdown stats', error: error.message });
  }
};
