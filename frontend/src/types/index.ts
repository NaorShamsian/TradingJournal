export interface Trade {
  _id: string;
  mt5DealId: string;
  mt5OrderId: string;
  positionId: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openTime: string;
  closeTime: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  commission: number;
  swap: number;
  netProfit: number;
  rr?: number;
  durationMinutes?: number;
  strategy?: string;
  session?: 'Asia' | 'London' | 'New York' | 'Other';
  emotion?: string;
  mistake?: boolean;
  mistakeTags?: string[];
  notes?: string;
  entryReason?: string;
  exitReason?: string;
  followedRules?: boolean;
  selfRating?: number;
  screenshotBeforeUrl?: string;
  screenshotAfterUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncStatus {
  _id: string;
  status: 'running' | 'stopped' | 'mt5_offline' | 'error';
  lastSyncTime?: string;
  lastSuccessfulSyncTime?: string;
  importedCount: number;
  skippedDuplicates: number;
  lastError?: string;
  triggerManualSync: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GroupedTrade extends Trade {
  isGrouped?: boolean;
  exitsCount?: number;
  rawExits?: Trade[];
}

export interface ISessionDefinition {
  name: 'Asia' | 'London' | 'New York' | 'Other';
  startHour: number;
  endHour: number;
}

export interface Settings {
  _id: string;
  defaultBalance: number;
  timezone: string;
  currency: string;
  strategies: string[];
  sessions: ISessionDefinition[];
  riskPerTradePercent: number;
}

export interface StatsSummary {
  totalNetPnL: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  averageWin: number;
  averageLoss: number;
  averageRR: number;
  maxDrawdownAmount: number;
  maxDrawdownPercent: number;
  bestDay: number;
  worstDay: number;
  thisWeekPnL: number;
  thisMonthPnL: number;
  currentBalance: number;
}

export interface EquityCurvePoint {
  tradeIndex: number;
  date: string;
  symbol: string;
  netProfit: number;
  equity: number;
}

export interface CalendarDaySummary {
  _id: string; // YYYY-MM-DD
  netProfit: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
}

export interface SymbolStat {
  symbol: string;
  totalTrades: number;
  netProfit: number;
  winRate: number;
  averageProfit: number;
  totalVolume: number;
}

export interface SessionStat {
  session: string;
  totalTrades: number;
  netProfit: number;
  winRate: number;
}

export interface StrategyStat {
  strategy: string;
  totalTrades: number;
  netProfit: number;
  winRate: number;
  avgRR: number;
}

export interface HourStat {
  hour: number;
  totalTrades: number;
  netProfit: number;
  winRate: number;
}

export interface DrawdownPoint {
  date: string;
  balance: number;
  peak: number;
  drawdownAmount: number;
  drawdownPercent: number;
}
