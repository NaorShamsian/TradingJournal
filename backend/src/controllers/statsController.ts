import { Request, Response } from 'express';
import Trade from '../models/Trade';
import MT5Account from '../models/MT5Account';

// Helper to get initial balance from the active MT5 account profile
const getInitialBalance = async (): Promise<number> => {
  try {
    const activeAccount = await MT5Account.findOne({ isActive: true });
    return activeAccount ? activeAccount.defaultBalance : 25000;
  } catch {
    return 25000;
  }
};

// Helper to get currently active account number for trade filtering
const getActiveAccountNumber = async (): Promise<string> => {
  try {
    const activeAccount = await MT5Account.findOne({ isActive: true });
    return activeAccount ? String(activeAccount.login) : 'NO_ACTIVE_ACCOUNT';
  } catch {
    return 'NO_ACTIVE_ACCOUNT';
  }
};

// GET /api/stats/summary
export const getSummaryStats = async (req: Request, res: Response) => {
  try {
    const initialBalance = await getInitialBalance();
    const accountNumber = await getActiveAccountNumber();
    const trades = await Trade.find({ accountNumber }).sort({ closeTime: 1 });

    if (trades.length === 0) {
      return res.json({
        totalNetPnL: 0,
        winRate: 0,
        profitFactor: 0,
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        breakevenCount: 0,
        averageWin: 0,
        averageLoss: 0,
        averageRR: 0,
        maxDrawdownAmount: 0,
        maxDrawdownPercent: 0,
        bestDay: 0,
        worstDay: 0,
        thisWeekPnL: 0,
        thisMonthPnL: 0,
        currentBalance: initialBalance,
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

    // Equity and Drawdown
    let currentBalance = initialBalance;
    let peak = initialBalance;
    let maxDrawdownAmount = 0;
    let maxDrawdownPercent = 0;

    // Daily tracking
    const dailyPnLMap: { [key: string]: number } = {};

    // For Week & Month stats
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let thisWeekPnL = 0;
    let thisMonthPnL = 0;

    trades.forEach((trade) => {
      totalNetPnL += trade.netProfit;
      currentBalance += trade.netProfit;

      // Drawdown calculation
      if (currentBalance > peak) {
        peak = currentBalance;
      }
      const drawdownAmt = peak - currentBalance;
      const drawdownPct = peak > 0 ? (drawdownAmt / peak) * 100 : 0;
      if (drawdownAmt > maxDrawdownAmount) {
        maxDrawdownAmount = drawdownAmt;
      }
      if (drawdownPct > maxDrawdownPercent) {
        maxDrawdownPercent = drawdownPct;
      }

      // Win / Loss / Breakeven counts
      if (trade.netProfit > 0) {
        winCount++;
        grossProfit += trade.netProfit;
      } else if (trade.netProfit < 0) {
        lossCount++;
        grossLoss += Math.abs(trade.netProfit);
      } else {
        breakevenCount++;
      }

      // R:R avg
      if (trade.rr !== undefined && trade.rr > 0) {
        totalRR += trade.rr;
        rrCount++;
      }

      // Daily mapping
      const dateStr = new Date(trade.closeTime).toISOString().split('T')[0];
      dailyPnLMap[dateStr] = (dailyPnLMap[dateStr] || 0) + trade.netProfit;

      // This week/month profit aggregation
      const closeDate = new Date(trade.closeTime);
      if (closeDate >= startOfWeek) {
        thisWeekPnL += trade.netProfit;
      }
      if (closeDate >= startOfMonth) {
        thisMonthPnL += trade.netProfit;
      }
    });

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? Number(((winCount / totalTrades) * 100).toFixed(2)) : 0;
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : Number(grossProfit.toFixed(2));
    const averageWin = winCount > 0 ? Number((grossProfit / winCount).toFixed(2)) : 0;
    const averageLoss = lossCount > 0 ? Number((grossLoss / lossCount).toFixed(2)) : 0;
    const averageRR = rrCount > 0 ? Number((totalRR / rrCount).toFixed(2)) : 0;

    const dailyPnLs = Object.values(dailyPnLMap);
    const bestDay = dailyPnLs.length > 0 ? Math.max(...dailyPnLs) : 0;
    const worstDay = dailyPnLs.length > 0 ? Math.min(...dailyPnLs) : 0;

    res.json({
      totalNetPnL,
      winRate,
      profitFactor,
      totalTrades,
      winCount,
      lossCount,
      breakevenCount,
      averageWin,
      averageLoss,
      averageRR,
      maxDrawdownAmount: Number(maxDrawdownAmount.toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
      bestDay: Number(bestDay.toFixed(2)),
      worstDay: Number(worstDay.toFixed(2)),
      thisWeekPnL: Number(thisWeekPnL.toFixed(2)),
      thisMonthPnL: Number(thisMonthPnL.toFixed(2)),
      currentBalance: Number(currentBalance.toFixed(2)),
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating summary stats', error: error.message });
  }
};

// GET /api/stats/equity-curve
export const getEquityCurve = async (req: Request, res: Response) => {
  try {
    const initialBalance = await getInitialBalance();
    const accountNumber = await getActiveAccountNumber();
    const trades = await Trade.find({ accountNumber }).sort({ closeTime: 1 }).select('closeTime openTime netProfit symbol mt5DealId');

    let currentBalance = initialBalance;
    const curve = trades.map((trade, index) => {
      currentBalance += trade.netProfit;
      return {
        tradeIndex: index + 1,
        date: trade.closeTime,
        symbol: trade.symbol,
        netProfit: trade.netProfit,
        equity: currentBalance,
      };
    });

    res.json({
      initialBalance,
      curve: [
        { tradeIndex: 0, date: trades[0]?.openTime || new Date(Date.now() - 86400000 * 30), symbol: 'START', netProfit: 0, equity: initialBalance },
        ...curve
      ]
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating equity curve', error: error.message });
  }
};

// GET /api/stats/calendar
export const getCalendarStats = async (req: Request, res: Response) => {
  try {
    const accountNumber = await getActiveAccountNumber();
    const calendar = await Trade.aggregate([
      { $match: { accountNumber } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$closeTime' } },
          netProfit: { $sum: '$netProfit' },
          tradeCount: { $sum: 1 },
          winCount: { $sum: { $cond: [{ $gt: ['$netProfit', 0] }, 1, 0] } },
          lossCount: { $sum: { $cond: [{ $lt: ['$netProfit', 0] }, 1, 0] } },
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json(calendar);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating calendar stats', error: error.message });
  }
};

// GET /api/stats/by-symbol
export const getStatsBySymbol = async (req: Request, res: Response) => {
  try {
    const accountNumber = await getActiveAccountNumber();
    const stats = await Trade.aggregate([
      { $match: { accountNumber } },
      {
        $group: {
          _id: '$symbol',
          totalTrades: { $sum: 1 },
          netProfit: { $sum: '$netProfit' },
          winCount: { $sum: { $cond: [{ $gt: ['$netProfit', 0] }, 1, 0] } },
          lossCount: { $sum: { $cond: [{ $lt: ['$netProfit', 0] }, 1, 0] } },
          totalVolume: { $sum: '$volume' },
        }
      },
      {
        $project: {
          symbol: '$_id',
          totalTrades: 1,
          netProfit: 1,
          winRate: {
            $cond: [
              { $gt: ['$totalTrades', 0] },
              { $multiply: [{ $divide: ['$winCount', '$totalTrades'] }, 100] },
              0
            ]
          },
          averageProfit: { $divide: ['$netProfit', '$totalTrades'] },
          totalVolume: 1,
        }
      },
      { $sort: { netProfit: -1 } }
    ]);

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating stats by symbol', error: error.message });
  }
};

// GET /api/stats/by-session
export const getStatsBySession = async (req: Request, res: Response) => {
  try {
    const accountNumber = await getActiveAccountNumber();
    const stats = await Trade.aggregate([
      { $match: { accountNumber } },
      {
        $group: {
          _id: '$session',
          totalTrades: { $sum: 1 },
          netProfit: { $sum: '$netProfit' },
          winCount: { $sum: { $cond: [{ $gt: ['$netProfit', 0] }, 1, 0] } },
        }
      },
      {
        $project: {
          session: '$_id',
          totalTrades: 1,
          netProfit: 1,
          winRate: {
            $cond: [
              { $gt: ['$totalTrades', 0] },
              { $multiply: [{ $divide: ['$winCount', '$totalTrades'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { netProfit: -1 } }
    ]);

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating stats by session', error: error.message });
  }
};

// GET /api/stats/by-strategy
export const getStatsByStrategy = async (req: Request, res: Response) => {
  try {
    const accountNumber = await getActiveAccountNumber();
    const stats = await Trade.aggregate([
      { $match: { accountNumber } },
      {
        $group: {
          _id: '$strategy',
          totalTrades: { $sum: 1 },
          netProfit: { $sum: '$netProfit' },
          winCount: { $sum: { $cond: [{ $gt: ['$netProfit', 0] }, 1, 0] } },
          totalRR: { $sum: { $ifNull: ['$rr', 0] } },
          rrCount: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$rr', 0] }, 0] }, 1, 0] } },
        }
      },
      {
        $project: {
          strategy: '$_id',
          totalTrades: 1,
          netProfit: 1,
          winRate: {
            $cond: [
              { $gt: ['$totalTrades', 0] },
              { $multiply: [{ $divide: ['$winCount', '$totalTrades'] }, 100] },
              0
            ]
          },
          avgRR: {
            $cond: [
              { $gt: ['$rrCount', 0] },
              { $divide: ['$totalRR', '$rrCount'] },
              0
            ]
          }
        }
      },
      { $sort: { netProfit: -1 } }
    ]);

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating stats by strategy', error: error.message });
  }
};

// GET /api/stats/by-hour
export const getStatsByHour = async (req: Request, res: Response) => {
  try {
    const accountNumber = await getActiveAccountNumber();
    const stats = await Trade.aggregate([
      { $match: { accountNumber } },
      {
        $project: {
          hour: { $hour: '$closeTime' },
          netProfit: 1,
        }
      },
      {
        $group: {
          _id: '$hour',
          totalTrades: { $sum: 1 },
          netProfit: { $sum: '$netProfit' },
          winCount: { $sum: { $cond: [{ $gt: ['$netProfit', 0] }, 1, 0] } },
        }
      },
      {
        $project: {
          hour: '$_id',
          totalTrades: 1,
          netProfit: 1,
          winRate: {
            $cond: [
              { $gt: ['$totalTrades', 0] },
              { $multiply: [{ $divide: ['$winCount', '$totalTrades'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { hour: 1 } }
    ]);

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating stats by hour', error: error.message });
  }
};

// GET /api/stats/drawdown
export const getDrawdownStats = async (req: Request, res: Response) => {
  try {
    const initialBalance = await getInitialBalance();
    const accountNumber = await getActiveAccountNumber();
    const trades = await Trade.find({ accountNumber }).sort({ closeTime: 1 }).select('closeTime netProfit');

    let currentBalance = initialBalance;
    let peak = initialBalance;
    const drawdowns = trades.map((trade) => {
      currentBalance += trade.netProfit;
      if (currentBalance > peak) {
        peak = currentBalance;
      }
      const drawdownAmount = peak - currentBalance;
      const drawdownPercent = peak > 0 ? (drawdownAmount / peak) * 100 : 0;
      return {
        date: trade.closeTime,
        balance: currentBalance,
        peak: peak,
        drawdownAmount,
        drawdownPercent,
      };
    });

    res.json(drawdowns);
  } catch (error: any) {
    res.status(500).json({ message: 'Error calculating drawdown stats', error: error.message });
  }
};
