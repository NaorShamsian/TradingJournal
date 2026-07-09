import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Percent,
  Calculator,
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
  DollarSign,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import api from '../services/api';
import { EquityCurvePoint, Trade, Settings } from '../types';
import { formatCurrency, formatPercent, formatDate, calculateTradeRR, formatRR, groupTradesByPosition } from '../utils/format';
import { useThemeLang } from '../context/ThemeLangContext';

export const Dashboard: React.FC = () => {
  const { t, lang, theme } = useThemeLang();
  const [equityData, setEquityData] = useState<EquityCurvePoint[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timeframe selector state
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'quarter' | 'year' | 'all'>('all');

  // Paginated trades states for Dashboard
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesTotalPages, setTradesTotalPages] = useState(1);
  const [tradesTotalCount, setTradesTotalCount] = useState(0);
  const [tradesSortBy, setTradesSortBy] = useState('closeTime');
  const [tradesSortOrder, setTradesSortOrder] = useState<'asc' | 'desc'>('desc');
  const [tradesLoading, setTradesLoading] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      const [, equityRes, settingsRes] = await Promise.all([
        api.getStatsSummary(),
        api.getEquityCurve(),
        api.getSettings(),
      ]);

      setEquityData(equityRes.curve || []);
      setSettings(settingsRes);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load dashboard statistics.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentTrades = async () => {
    try {
      setTradesLoading(true);
      let startDateParam: string | undefined = undefined;
      if (timeframe !== 'all') {
        const now = new Date();
        let days = 7;
        if (timeframe === 'week') days = 7;
        else if (timeframe === 'month') days = 30;
        else if (timeframe === 'quarter') days = 90;
        else if (timeframe === 'year') days = 365;
        
        const startDateObj = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        startDateParam = startDateObj.toISOString();
      }
      
      const tradesRes = await api.getTrades({
        page: tradesPage,
        limit: 8,
        sortBy: tradesSortBy,
        sortOrder: tradesSortOrder,
        startDate: startDateParam
      });
      
      setRecentTrades(tradesRes.trades || []);
      setTradesTotalPages(tradesRes.pagination.pages || 1);
      setTradesTotalCount(tradesRes.pagination.total || 0);
    } catch (err) {
      console.error('Error loading dashboard trades:', err);
    } finally {
      setTradesLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (tradesSortBy === field) {
      setTradesSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setTradesSortBy(field);
      setTradesSortOrder('desc');
    }
    setTradesPage(1);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setTradesPage(1);
  }, [timeframe]);

  useEffect(() => {
    fetchRecentTrades();
  }, [tradesPage, tradesSortBy, tradesSortOrder, timeframe]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
        <p className="text-slate-400 text-sm font-medium">{lang === 'he' ? 'טוען נתונים ומבצע חישובי סטטיסטיקה...' : 'Analyzing trading database...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel p-8 rounded-2xl max-w-lg mx-auto text-center border-danger/30 mt-10">
        <AlertTriangle className="h-12 w-12 text-danger mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Failed to load statistics</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{error}</p>
        <button
          onClick={fetchData}
          className="px-6 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-xl transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  const currency = settings?.currency || 'USD';
  const startingBalance = settings?.defaultBalance || 25000;
  const riskPercent = settings?.riskPerTradePercent || 1.0;
  const riskAmount = (startingBalance * riskPercent) / 100;

  // Filter lists based on selected timeframe
  const filterByTimeframe = <T extends { date?: string; closeTime?: string }>(list: T[]): T[] => {
    const now = new Date();
    return list.filter(item => {
      const itemDateStr = item.date || item.closeTime;
      if (!itemDateStr) return true;
      const itemDate = new Date(itemDateStr);
      const diffTime = now.getTime() - itemDate.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      if (timeframe === 'week') return diffDays <= 7;
      if (timeframe === 'month') return diffDays <= 30;
      if (timeframe === 'quarter') return diffDays <= 90;
      if (timeframe === 'year') return diffDays <= 365;
      return true; // 'all'
    });
  };

  const filteredEquityRaw = filterByTimeframe(equityData.filter(pt => pt.tradeIndex > 0));

  // Smart position grouping on recent trades
  const groupedRecentTrades = groupTradesByPosition(recentTrades);

  // Dynamically calculate metrics based on the selected timeframe
  let calculatedNetPnL = 0;
  let calculatedWins = 0;
  let calculatedLosses = 0;
  let calculatedBreakevens = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let maxDrawdownAmt = 0;
  let peakEquity = startingBalance;

  let totalCalculatedRR = 0;
  let countRR = 0;

  let runningBalance = startingBalance;
  const progressiveEquityData = [{ name: 'Start', equity: startingBalance, netProfit: 0, date: '' }];

  // Recalculate metrics chronologically over filtered dataset
  filteredEquityRaw.forEach((pt, idx) => {
    calculatedNetPnL += pt.netProfit;
    
    if (pt.netProfit > 1) {
      calculatedWins++;
      grossWins += pt.netProfit;
    } else if (pt.netProfit < -1) {
      calculatedLosses++;
      grossLosses += Math.abs(pt.netProfit);
    } else {
      calculatedBreakevens++;
    }

    // Dynamic R:R calculation
    totalCalculatedRR += calculateTradeRR(pt.netProfit, startingBalance, riskPercent);
    countRR++;

    // Progressive curve data
    runningBalance += pt.netProfit;
    progressiveEquityData.push({
      name: `Trade #${idx + 1}`,
      equity: runningBalance,
      netProfit: pt.netProfit,
      date: formatDate(pt.date),
    });

    // Drawdown calculation
    if (runningBalance > peakEquity) {
      peakEquity = runningBalance;
    }
    const currentDrawdown = peakEquity - runningBalance;
    if (currentDrawdown > maxDrawdownAmt) {
      maxDrawdownAmt = currentDrawdown;
    }
  });

  const totalTradesCount = filteredEquityRaw.length;
  const calculatedWinRate = totalTradesCount > 0 ? (calculatedWins / totalTradesCount) : 0;
  const calculatedProfitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99.9 : 0;
  const averageWin = calculatedWins > 0 ? grossWins / calculatedWins : 0;
  const averageLoss = calculatedLosses > 0 ? grossLosses / calculatedLosses : 0;
  const averageCalculatedRR = countRR > 0 ? totalCalculatedRR / countRR : 0;
  const maxDrawdownPercent = peakEquity > 0 ? (maxDrawdownAmt / peakEquity) * 100 : 0;
  const currentRealBalance = startingBalance + calculatedNetPnL;

  // Daily PnL Bar Chart preparation
  const dailyPnLMap: { [key: string]: number } = {};
  filteredEquityRaw.forEach(pt => {
    const dateStr = pt.date.split('T')[0];
    dailyPnLMap[dateStr] = (dailyPnLMap[dateStr] || 0) + pt.netProfit;
  });
  
  const dailyPnLData = Object.entries(dailyPnLMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-10)
    .map(([date, profit]) => ({
      date: date.substring(5), // MM-DD
      profit,
    }));

  const pnlColor = calculatedNetPnL >= 0 ? 'text-emerald-500' : 'text-rose-500';

  // Dynamic colors for Recharts tooltips in light mode
  const tooltipBg = theme === 'dark' ? 'rgb(14 15 30)' : '#ffffff';
  const tooltipBorder = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const tooltipText = theme === 'dark' ? '#ffffff' : '#1e293b';

  return (
    <div className="space-y-8 animate-fade-in text-slate-800 dark:text-slate-100">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
            {lang === 'he' ? 'ביצועי מסחר ואנליזה' : 'Trading Performance'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-1">
            {lang === 'he' 
              ? 'יומן עסקאות אישי מבית TraderNet המחובר ל-MT5.' 
              : 'Real-time analytics and MT5 closed deal summaries.'}
          </p>
        </div>
        
        {/* Timeframe Regulators */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/50 dark:bg-slate-900 border border-slate-200 dark:border-border/60 rounded-xl w-fit">
          {(['week', 'month', 'quarter', 'year', 'all'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                timeframe === tf
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {tf === 'week' && (lang === 'he' ? 'שבוע' : 'Week')}
              {tf === 'month' && (lang === 'he' ? 'חודש' : 'Month')}
              {tf === 'quarter' && (lang === 'he' ? 'רבעון' : 'Quarter')}
              {tf === 'year' && (lang === 'he' ? 'שנה' : 'Year')}
              {tf === 'all' && (lang === 'he' ? 'הכל' : 'All')}
            </button>
          ))}
        </div>
      </div>

      {/* Account Info and Risk Definition Banner */}
      <div className="p-5 rounded-2xl bg-white dark:bg-card border border-slate-200 dark:border-border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="h-4.5 w-4.5 text-primary" />
            {lang === 'he' ? 'פרטי ותקדמות החשבון' : 'Account Progress Details'}
          </h3>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2 text-xs md:text-sm">
            <div>
              <span className="text-slate-400 font-semibold">{t('startingBalance')}: </span>
              <span className="font-bold text-slate-800 dark:text-white">{formatCurrency(startingBalance, currency)}</span>
            </div>
            <div className="hidden md:block text-slate-200 dark:text-slate-700">|</div>
            <div>
              <span className="text-slate-400 font-semibold">{t('realAccountBalance')}: </span>
              <span className="font-extrabold text-primary">{formatCurrency(currentRealBalance, currency)}</span>
            </div>
          </div>
        </div>
        
        {/* Risk Info badge */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-border/60 rounded-xl">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Risk parameters (1R Size)</span>
          <p className="text-xs md:text-sm text-slate-700 dark:text-slate-200 font-bold mt-0.5">
            1R = <span className="text-primary font-black">{formatCurrency(riskAmount, currency)}</span> 
            <span className="text-[10px] text-slate-455 font-semibold ml-1 mr-1">({riskPercent}% of starting balance)</span>
          </p>
        </div>
      </div>

      {/* Grid Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Net Profit */}
        <div className="p-5 rounded-2xl flex flex-col justify-between border border-slate-200 dark:border-border bg-white dark:bg-card shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-xs md:text-sm text-slate-550 dark:text-slate-400 font-bold">{t('netPnl')}</span>
            <div className={`p-1.5 rounded-lg border ${ calculatedNetPnL >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-rose-500/10 border-rose-500/30 text-rose-500'}`}>
              <DollarSign className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className={`text-xl md:text-2xl font-black ${pnlColor}`}>
              {calculatedNetPnL >= 0 ? '+' : ''}{formatCurrency(calculatedNetPnL, currency)}
            </h2>
            <p className="text-[10px] md:text-xs text-slate-400 font-semibold mt-1">
              {lang === 'he' ? 'רווח יחסי:' : 'Relative R Gain:'} <span className={`font-bold ${pnlColor}`}>{formatRR(calculateTradeRR(calculatedNetPnL, startingBalance, riskPercent))}</span>
            </p>
          </div>
        </div>

        {/* Win Rate */}
        <div className="p-5 rounded-2xl flex flex-col justify-between border border-slate-200 dark:border-border bg-white dark:bg-card shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-xs md:text-sm text-slate-550 dark:text-slate-400 font-bold">{t('winRate')}</span>
            <div className="p-1.5 bg-primary/10 border border-primary/30 text-primary rounded-lg">
              <Percent className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
              {formatPercent(calculatedWinRate)}
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-bold text-slate-500 mt-1">
              <span className="text-emerald-500">{calculatedWins} W</span>
              <span>•</span>
              <span className="text-rose-500">{calculatedLosses} L</span>
              <span>•</span>
              <span>{calculatedBreakevens} BE</span>
            </div>
          </div>
        </div>

        {/* Profit Factor */}
        <div className="p-5 rounded-2xl flex flex-col justify-between border border-slate-200 dark:border-border bg-white dark:bg-card shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-xs md:text-sm text-slate-555 dark:text-slate-400 font-bold">{t('profitFactor')}</span>
            <div className="p-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 rounded-lg">
              <Calculator className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
              {calculatedProfitFactor ? calculatedProfitFactor.toFixed(2) : '0.00'}
            </h2>
            <p className="text-[10px] md:text-xs text-slate-455 font-semibold mt-1">
              {lang === 'he' ? 'יחס רווח גולמי מול הפסד' : 'Ratio of gross wins vs losses'}
            </p>
          </div>
        </div>

        {/* Total Trades */}
        <div className="p-5 rounded-2xl flex flex-col justify-between border border-slate-200 dark:border-border bg-white dark:bg-card shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-xs md:text-sm text-slate-550 dark:text-slate-400 font-bold">{t('totalTrades')}</span>
            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-border text-slate-600 dark:text-slate-300 rounded-lg">
              <Calendar className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
              {totalTradesCount}
            </h2>
            <p className="text-[10px] md:text-xs text-slate-455 font-semibold mt-1">
              {lang === 'he' ? 'עסקאות מסונכרנות מ-MT5' : 'MT5 synced closed deals'}
            </p>
          </div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white dark:bg-card/40 border border-slate-200 dark:border-border p-4 rounded-2xl shadow-sm">
        <div>
          <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">{t('avgWin')}</span>
          <p className="text-sm md:text-base font-black text-emerald-500 mt-0.5">{formatCurrency(averageWin, currency)}</p>
        </div>
        <div>
          <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">{t('avgLoss')}</span>
          <p className="text-sm md:text-base font-black text-rose-500 mt-0.5">{formatCurrency(averageLoss, currency)}</p>
        </div>
        <div>
          <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">{t('avgRR')}</span>
          <p className="text-sm md:text-base font-black text-slate-850 dark:text-slate-200 mt-0.5">
            {averageCalculatedRR >= 0 ? '+' : ''}{averageCalculatedRR.toFixed(2)}R
          </p>
        </div>
        <div>
          <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">{t('maxDrawdown')}</span>
          <p className="text-sm md:text-base font-black text-orange-500 mt-0.5">
            {formatPercent(maxDrawdownPercent / 100)} 
            <span className="text-xs text-slate-400 font-bold ml-1 mr-1">({formatCurrency(maxDrawdownAmt, currency)})</span>
          </p>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equity Curve Chart */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-border space-y-4 bg-white dark:bg-card shadow-sm">
          <div className="flex justify-between items-center">
            <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white">
              {lang === 'he' ? 'עקומת גידול הון (Equity Curve)' : 'Equity Growth Curve'}
            </h3>
            <span className="text-xs text-slate-400 font-semibold">{lang === 'he' ? 'התקדמות הון כרונולוגית' : 'Chronological accumulation'}</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={progressiveEquityData}>
                <defs>
                  <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(124,58,237,0.06)" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="rgba(100,116,139,0.5)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  stroke="rgba(100,116,139,0.5)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => `$${val}`}
                  domain={['dataMin - 1000', 'dataMax + 1000']}
                />
                <Tooltip
                  contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '12px' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}
                  itemStyle={{ color: tooltipText, fontSize: '13px' }}
                  formatter={(value: any) => [formatCurrency(Number(value), currency), 'Balance']}
                />
                <Area type="monotone" dataKey="equity" stroke="#7c3aed" strokeWidth={2.5} fillOpacity={1} fill="url(#colorEquity)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily PnL Bar Chart */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-border space-y-4 bg-white dark:bg-card shadow-sm">
          <div className="flex justify-between items-center">
            <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white">
              {lang === 'he' ? 'ביצועים לפי ימים' : 'Daily P&L Performance'}
            </h3>
            <span className="text-xs text-slate-400 font-semibold">{lang === 'he' ? '10 ימי מסחר אחרונים' : 'Last 10 trading days'}</span>
          </div>
          <div className="h-72 w-full">
            {dailyPnLData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyPnLData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(124,58,237,0.06)" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="rgba(100,116,139,0.5)" 
                    fontSize={10}
                    tickLine={false} 
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="rgba(100,116,139,0.5)" 
                    fontSize={10}
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '12px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}
                    itemStyle={{ color: tooltipText, fontSize: '13px' }}
                    formatter={(value: any) => [formatCurrency(Number(value), currency), 'Net P&L']}
                  />
                  <Bar 
                    dataKey="profit" 
                    radius={[4, 4, 0, 0]}
                    fill="#7c3aed"
                    children={dailyPnLData.map((entry, index) => (
                      <rect
                        key={`rect-${index}`}
                        fill={entry.profit >= 0 ? '#10b981' : '#ef4444'}
                      />
                    ))}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">
                {lang === 'he' ? 'אין עסקאות רשומות עדיין' : 'No trading days recorded'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Trades */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-border space-y-4 bg-white dark:bg-card shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{t('recentTrades')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'he' ? 'עסקאות אחרונות שיובאו אוטומטית מ-MetaTrader 5' : 'Review your latest executions from MetaTrader 5'}
            </p>
          </div>
          <Link
            to="/trades"
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark font-bold transition animate-fade-in"
          >
            {lang === 'he' ? 'צפה ביומן המלא' : 'View Full Log'}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-border rounded-xl bg-slate-50 dark:bg-slate-950/20">
          {groupedRecentTrades.length > 0 ? (
            <>
              <table className={`min-w-full divide-y divide-slate-200 dark:divide-border text-left text-xs md:text-sm transition-opacity duration-200 ${tradesLoading ? 'opacity-50' : 'opacity-100'}`}>
                <thead className="bg-slate-100/50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th 
                      onClick={() => handleSort('closeTime')} 
                      className="px-4 py-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        {lang === 'he' ? 'תאריך' : 'Time'}
                        {tradesSortBy === 'closeTime' && (
                          tradesSortOrder === 'asc' ? <ChevronUp className="h-3 w-3 text-primary" /> : <ChevronDown className="h-3 w-3 text-primary" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('symbol')} 
                      className="px-4 py-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        {lang === 'he' ? 'נכס' : 'Symbol'}
                        {tradesSortBy === 'symbol' && (
                          tradesSortOrder === 'asc' ? <ChevronUp className="h-3 w-3 text-primary" /> : <ChevronDown className="h-3 w-3 text-primary" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3">{lang === 'he' ? 'סוג' : 'Type'}</th>
                    <th 
                      onClick={() => handleSort('volume')} 
                      className="px-4 py-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        {lang === 'he' ? 'נפח' : 'Volume'}
                        {tradesSortBy === 'volume' && (
                          tradesSortOrder === 'asc' ? <ChevronUp className="h-3 w-3 text-primary" /> : <ChevronDown className="h-3 w-3 text-primary" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3">{lang === 'he' ? 'כניסה' : 'Entry'}</th>
                    <th className="px-4 py-3">{lang === 'he' ? 'יציאה' : 'Exit'}</th>
                    <th 
                      onClick={() => handleSort('netProfit')} 
                      className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-end gap-1">
                        {lang === 'he' ? 'רווח/הפסד נקי' : 'Net P&L'}
                        {tradesSortBy === 'netProfit' && (
                          tradesSortOrder === 'asc' ? <ChevronUp className="h-3 w-3 text-primary" /> : <ChevronDown className="h-3 w-3 text-primary" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-border bg-white dark:bg-slate-900/10 font-semibold text-slate-700 dark:text-slate-200">
                  {groupedRecentTrades.map((trade) => {
                    const profitVal = trade.netProfit;
                    const isPositive = profitVal >= 0;
                    return (
                      <tr key={trade._id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-normal whitespace-nowrap">
                          {formatDate(trade.closeTime)}
                        </td>
                        <td className="px-4 py-3 font-extrabold whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-900 dark:text-white">{trade.symbol}</span>
                            {trade.isGrouped && (
                              <span className="px-1.5 py-0.2 bg-primary/10 border border-primary/20 text-primary rounded-md text-[8px] font-black tracking-wider uppercase">
                                {trade.exitsCount} Exits
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                            trade.type === 'BUY' 
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' 
                              : 'bg-orange-500/10 border-orange-500/30 text-orange-500'
                          }`}>
                            {trade.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {trade.volume.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-slate-400 dark:text-slate-500 font-mono">
                          {trade.entryPrice.toFixed(5)}
                        </td>
                        <td className="px-4 py-3 text-slate-400 dark:text-slate-500 font-mono">
                          {trade.exitPrice.toFixed(5)}
                        </td>
                        <td className={`px-4 py-3 text-right font-black whitespace-nowrap ${
                          isPositive ? 'text-emerald-500' : 'text-rose-500'
                        }`}>
                          {profitVal > 0 ? '+' : ''}{formatCurrency(profitVal, currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination Bar */}
              {tradesTotalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-card border-t border-slate-200 dark:border-border">
                  <span className="text-xs text-slate-550 dark:text-slate-400">
                    {lang === 'he' ? (
                      <span>
                        מציג <span className="font-bold text-slate-850 dark:text-white">{recentTrades.length}</span> מתוך{' '}
                        <span className="font-bold text-slate-850 dark:text-white">{tradesTotalCount}</span> עסקאות
                      </span>
                    ) : (
                      <span>
                        Showing <span className="font-bold text-slate-850 dark:text-white">{recentTrades.length}</span> of{' '}
                        <span className="font-bold text-slate-850 dark:text-white">{tradesTotalCount}</span> trades
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTradesPage(prev => Math.max(prev - 1, 1))}
                      disabled={tradesPage === 1 || tradesLoading}
                      className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-border text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-xs text-slate-700 dark:text-slate-300 px-2 font-bold">
                      {lang === 'he' ? `עמוד ${tradesPage} מתוך ${tradesTotalPages}` : `Page ${tradesPage} of ${tradesTotalPages}`}
                    </span>
                    <button
                      onClick={() => setTradesPage(prev => Math.min(prev + 1, tradesTotalPages))}
                      disabled={tradesPage === tradesTotalPages || tradesLoading}
                      className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-border text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm italic">
              {lang === 'he' ? (
                <span>
                  לא נמצאו עסקאות לאחרונה. עבור אל{' '}
                  <Link to="/sync" className="text-primary hover:underline font-bold">
                    מרכז הסינכרון
                  </Link>{' '}
                  כדי לייבא עסקאות מה-MT5.
                </span>
              ) : (
                <span>
                  No recent trades found. Go to the{' '}
                  <Link to="/sync" className="text-primary hover:underline font-bold">
                    Sync Center
                  </Link>{' '}
                  to import deals.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
