import { Trade, GroupedTrade } from '../types';

export const formatCurrency = (value: number | undefined | null, currency: string = 'USD'): string => {
  if (value === undefined || value === null) return '$0.00';
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(value);
};

export const formatPercent = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '0.0%';
  return `${value.toFixed(1)}%`;
};

export const formatDate = (dateString: string | Date | undefined | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

export const formatTime = (dateString: string | Date | undefined | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  });
};

export const formatDateTime = (dateString: string | Date | undefined | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return `${formatDate(date)} ${formatTime(date)}`;
};

export const formatDuration = (minutes: number | undefined | null): string => {
  if (minutes === undefined || minutes === null) return '-';
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

export const formatNumber = (value: number | undefined | null, decimals: number = 2): string => {
  if (value === undefined || value === null) return '0';
  return value.toFixed(decimals);
};

export const calculateTradeRR = (
  netProfit: number,
  defaultBalance: number = 25000,
  riskPerTradePercent: number = 1.0
): number => {
  const riskAmount = (defaultBalance * riskPerTradePercent) / 100;
  if (riskAmount <= 0) return 0;
  return Number((netProfit / riskAmount).toFixed(2));
};

export const formatRR = (rr: number): string => {
  if (rr === 0) return '0.00R';
  return rr > 0 ? `+${rr.toFixed(2)}R` : `${rr.toFixed(2)}R`;
};

export const groupTradesByPosition = (rawTrades: Trade[]): GroupedTrade[] => {
  const groups = new Map<string, Trade[]>();
  rawTrades.forEach(t => {
    // Group by positionId if present, otherwise treat as individual deal
    const key = t.positionId || t._id;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(t);
  });

  return Array.from(groups.values()).map((list) => {
    // Sort exits chronologically (earliest open/close to latest close)
    list.sort((a, b) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime());
    
    const firstTrade = list[0];
    const lastTrade = list[list.length - 1];

    if (list.length === 1) {
      return {
        ...firstTrade,
        isGrouped: false,
        exitsCount: 1,
        rawExits: list
      } as GroupedTrade;
    }

    const totalVol = list.reduce((sum, t) => sum + t.volume, 0);
    const totalNetProfit = list.reduce((sum, t) => sum + t.netProfit, 0);
    const totalComm = list.reduce((sum, t) => sum + t.commission, 0);
    const totalSwap = list.reduce((sum, t) => sum + t.swap, 0);
    const totalProfit = list.reduce((sum, t) => sum + t.profit, 0);
    
    // Average exit price weighted by volume
    const sumExitVolumePrice = list.reduce((sum, t) => sum + (t.exitPrice * t.volume), 0);
    const weightedExitPrice = totalVol > 0 ? sumExitVolumePrice / totalVol : lastTrade.exitPrice;

    return {
      ...firstTrade,
      volume: totalVol,
      closeTime: lastTrade.closeTime, // fully closed at last exit time
      exitPrice: weightedExitPrice,
      profit: totalProfit,
      commission: totalComm,
      swap: totalSwap,
      netProfit: totalNetProfit,
      isGrouped: true,
      exitsCount: list.length,
      rawExits: list
    } as GroupedTrade;
  });
};

