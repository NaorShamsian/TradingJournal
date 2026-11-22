import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  Trash2,
  Edit,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Maximize2,
  Image as ImageIcon
} from 'lucide-react';
import api from '../services/api';
import { GroupedTrade, Settings } from '../types';
import { formatCurrency, formatDate, formatTime, calculateTradeRR, formatRR } from '../utils/format';
import { useThemeLang } from '../context/ThemeLangContext';
import { OutcomeBadge, MergedBadge, outcomeSurface, outcomeAccent, pnlText } from '../components/Outcome';

export const Trades: React.FC = () => {
  const { t, lang } = useThemeLang();
  const [trades, setTrades] = useState<GroupedTrade[]>([]);
  const [grouped, setGrouped] = useState(true);
  const [rawPositions, setRawPositions] = useState<number | undefined>(undefined);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [search, setSearch] = useState('');
  const [symbol, setSymbol] = useState('');
  const [strategy, setStrategy] = useState('');
  const [session, setSession] = useState('');
  const [outcome, setOutcome] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('closeTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 20;

  // Zoom Lightbox states
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(100);

  const fetchTradesAndSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const [tradesRes, settingsRes] = await Promise.all([
        api.getTrades({
          search,
          symbol,
          strategy,
          session,
          outcome,
          startDate,
          endDate,
          page: currentPage,
          limit,
          sortBy,
          sortOrder,
          grouped,
        }),
        api.getSettings(),
      ]);

      setTrades(tradesRes.trades);
      setTotalPages(tradesRes.pagination.pages);
      setTotalCount(tradesRes.pagination.total);
      setRawPositions(tradesRes.pagination.rawPositions);
      setSettings(settingsRes);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error fetching trades log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTradesAndSettings();
  }, [currentPage, symbol, strategy, session, outcome, startDate, endDate, sortBy, sortOrder, grouped]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchTradesAndSettings();
  };

  const handleClearFilters = () => {
    setSearch('');
    setSymbol('');
    setStrategy('');
    setSession('');
    setOutcome('all');
    setStartDate('');
    setEndDate('');
    setSortBy('closeTime');
    setSortOrder('desc');
    setCurrentPage(1);
  };

  const handleDeleteTrade = async (trade: GroupedTrade) => {
    const others = (trade.memberIds || []).filter((m) => m !== trade._id);
    const msg = others.length
      ? (lang === 'he'
          ? `למחוק את העסקה המאוחדת כולה (${others.length + 1} עסקאות ב-MT5)?`
          : `Delete the whole merged trade (${others.length + 1} MT5 deals)?`)
      : t('confirmDelete');
    if (!window.confirm(msg)) {
      return;
    }
    try {
      await api.deleteTrade(trade._id, others);
      setTrades(trades.filter(x => x._id !== trade._id));
      setTotalCount(prev => prev - 1);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const currency = settings?.currency || 'USD';
  const startingBalance = settings?.defaultBalance || 25000;
  const riskPercent = settings?.riskPerTradePercent || 1.0;

  // Trades arrive already smart-grouped from the API
  const groupedTradesList = trades;

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">{t('tradesLog')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-1">
            {lang === 'he'
              ? 'סנן, נתח והוסף הערות לעסקאות ה-MT5 שלך.'
              : 'Review, filter, and journal your closed executions.'}
          </p>
          {grouped && rawPositions !== undefined && rawPositions > totalCount && (
            <p className="text-[11px] text-primary font-bold mt-1">
              {lang === 'he'
                ? `${totalCount} עסקאות (אוחדו מתוך ${rawPositions} פוזיציות ב-MT5)`
                : `${totalCount} trades (merged from ${rawPositions} MT5 positions)`}
            </p>
          )}
        </div>
        {/* Merged / per-position view toggle */}
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border self-start md:self-auto">
          {[true, false].map((g) => (
            <button
              key={String(g)}
              type="button"
              onClick={() => { setGrouped(g); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                grouped === g ? 'bg-primary text-white shadow' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {g ? (lang === 'he' ? 'עסקאות מאוחדות' : 'Merged trades') : (lang === 'he' ? 'כל פוזיציה בנפרד' : 'Each position')}
            </button>
          ))}
        </div>
      </div>

      {/* Filters Panel */}
      <div className="glass-panel p-5 rounded-2xl space-y-4 bg-white dark:bg-card border border-slate-200 dark:border-border shadow-sm">
        {/* Row 1: Search & Outcome */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 relative">
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-100 placeholder-slate-500"
            />
            <Search className={`absolute ${lang === 'he' ? 'right-3.5' : 'left-3.5'} top-3.5 h-4 w-4 text-slate-500`} />
          </div>
          
          <div>
            <select
              value={outcome}
              onChange={(e) => { setOutcome(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-700 dark:text-slate-300 font-semibold"
            >
              <option value="all">{t('allOutcomes')}</option>
              <option value="win">{t('wins')}</option>
              <option value="loss">{t('losses')}</option>
              <option value="breakeven">{t('breakeven')}</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary-dark text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2"
          >
            <Filter className="h-4 w-4" />
            {lang === 'he' ? 'החל חיפוש' : 'Apply Search'}
          </button>
        </form>

        {/* Row 2: Advanced Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2 border-t border-slate-200 dark:border-border/50">
          <div>
            <label className="text-[10px] text-slate-400 dark:text-slate-505 font-bold uppercase tracking-wider block mb-1">{t('symbol')}</label>
            <input
              type="text"
              placeholder="e.g. NDX100"
              value={symbol}
              onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-lg text-xs focus:outline-none focus:border-primary text-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 dark:text-slate-505 font-bold uppercase tracking-wider block mb-1">{t('strategy')}</label>
            <select
              value={strategy}
              onChange={(e) => { setStrategy(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-lg text-xs focus:outline-none focus:border-primary text-slate-700 dark:text-slate-300"
            >
              <option value="">{lang === 'he' ? 'כל האסטרטגיות' : 'All Strategies'}</option>
              {settings?.strategies.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 dark:text-slate-505 font-bold uppercase tracking-wider block mb-1">{t('session')}</label>
            <select
              value={session}
              onChange={(e) => { setSession(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-lg text-xs focus:outline-none focus:border-primary text-slate-700 dark:text-slate-300"
            >
              <option value="">{lang === 'he' ? 'כל הסשנים' : 'All Sessions'}</option>
              <option value="Asia">Asia</option>
              <option value="London">London</option>
              <option value="New York">New York</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 dark:text-slate-555 font-bold uppercase tracking-wider block mb-1">{lang === 'he' ? 'תאריך התחלה' : 'Start Date'}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-lg text-xs focus:outline-none focus:border-primary text-slate-700 dark:text-slate-300"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 dark:text-slate-505 font-bold uppercase tracking-wider block mb-1">{lang === 'he' ? 'מיון' : 'Sort'}</label>
            <select
              value={`${sortBy}_${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('_');
                setSortBy(field);
                setSortOrder(order as 'asc' | 'desc');
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-lg text-xs focus:outline-none focus:border-primary text-slate-700 dark:text-slate-300 font-semibold"
            >
              <option value="closeTime_desc">{lang === 'he' ? 'החדש ביותר' : 'Newest'}</option>
              <option value="closeTime_asc">{lang === 'he' ? 'הישן ביותר' : 'Oldest'}</option>
              <option value="netProfit_desc">{lang === 'he' ? 'הכי רווחי' : 'Highest Profit'}</option>
              <option value="netProfit_asc">{lang === 'he' ? 'הכי מפסיד' : 'Highest Loss'}</option>
              <option value="volume_desc">{lang === 'he' ? 'נפח (גבוה לנמוך)' : 'Volume (High-Low)'}</option>
              <option value="volume_asc">{lang === 'he' ? 'נפח (נמוך לגבוה)' : 'Volume (Low-High)'}</option>
            </select>
          </div>

          <div className="col-span-2 sm:col-span-1 flex items-end">
            <button
              onClick={handleClearFilters}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-border hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              {t('clearFilters')}
            </button>
          </div>
        </div>
      </div>

      {/* Grid Block Layout */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-border bg-slate-50/50 dark:bg-slate-950/20 shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold">{lang === 'he' ? 'מעדכן את ספר העסקאות...' : 'Updating trades ledger...'}</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center bg-white dark:bg-card">
            <AlertCircle className="h-10 w-10 text-danger mx-auto mb-3" />
            <p className="text-slate-800 dark:text-white font-bold">{error}</p>
            <button onClick={fetchTradesAndSettings} className="mt-4 text-xs text-primary hover:underline font-bold">Retry</button>
          </div>
        ) : groupedTradesList.length > 0 ? (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedTradesList.map((trade) => {
                const profitVal = trade.netProfit;
                const calculatedRR = calculateTradeRR(profitVal, startingBalance, riskPercent);
                
                // Prioritize After screenshot, fallback to Before
                const chartImage = trade.screenshotAfterUrl || trade.screenshotBeforeUrl;

                return (
                  <div
                    key={trade._id}
                    className={`relative flex flex-col border rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-300 group ${outcomeSurface(profitVal)}`}
                  >
                    {/* Win / loss accent strip */}
                    <div className={`absolute top-0 inset-x-0 h-1 z-10 ${outcomeAccent(profitVal)}`} />
                    {/* Visual Screenshot display if exists */}
                    {chartImage ? (
                      <div 
                        className="h-48 w-full bg-slate-100 dark:bg-slate-950 relative overflow-hidden cursor-pointer border-b border-slate-100 dark:border-border/30"
                        onClick={() => { setZoomImage(chartImage); setZoomScale(100); }}
                      >
                        <img 
                          src={chartImage} 
                          alt={`${trade.symbol} trade screenshot`}
                          className="w-full h-full object-cover group-hover:scale-102 transition duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-3 opacity-0 group-hover:opacity-100 transition duration-300">
                          <span className="text-white text-[10px] font-bold flex items-center gap-1">
                            <Maximize2 className="h-3.5 w-3.5" />
                            {lang === 'he' ? 'הגדל תמונה' : 'Zoom Chart'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="h-32 w-full bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-border/30 flex flex-col items-center justify-center gap-1.5 text-slate-400">
                        <ImageIcon className="h-7 w-7 stroke-[1.5]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {lang === 'he' ? 'אין תמונה לעסקה' : 'No screenshot attached'}
                        </span>
                      </div>
                    )}

                    {/* Card Content Body */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      
                      {/* Ticker & Close time header */}
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-lg font-black text-slate-900 dark:text-white">{trade.symbol}</span>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${
                              trade.type === 'BUY' 
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' 
                                : 'bg-orange-500/10 border-orange-500/30 text-orange-500'
                            }`}>
                              {trade.type}
                            </span>
                            <OutcomeBadge netProfit={profitVal} lang={lang} />
                            <MergedBadge positions={trade.positionsCount} lang={lang} />
                          </div>
                          
                          <span className="text-[10px] text-slate-400 font-bold uppercase whitespace-nowrap">
                            {formatDate(trade.closeTime)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-455 font-bold mt-1">
                          {formatTime(trade.openTime)}–{formatTime(trade.closeTime)} • {trade.volume.toFixed(2)} Lots
                          {trade.isGrouped && (
                            <span className="text-primary">
                              {' '}• {lang === 'he' ? `${trade.positionsCount} פוזיציות אוחדו` : `${trade.positionsCount} positions merged`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Prices grid */}
                      <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/50 dark:border-border/40 text-xs font-semibold text-slate-500">
                        <div>
                          <span className="block text-[9px] text-slate-400 uppercase">{t('entryPrice')}</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200 font-black">{trade.entryPrice.toFixed(5)}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 uppercase">{t('exitPrice')}</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200 font-black">{trade.exitPrice.toFixed(5)}</span>
                        </div>
                      </div>

                      {/* Profit and R:R Display */}
                      <div className="flex items-center justify-between border-t border-b border-slate-250/20 dark:border-border/30 py-3">
                        <div>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase">{lang === 'he' ? 'רווח/הפסד נקי' : 'Net P&L'}</span>
                          <span className={`text-xl font-black ${pnlText(profitVal)}`}>
                            {profitVal > 0 ? '+' : ''}{formatCurrency(profitVal, currency)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[9px] text-slate-400 font-bold uppercase">{t('avgRR')}</span>
                          <span className={`text-base font-black ${pnlText(calculatedRR)}`}>
                            {formatRR(calculatedRR)}
                          </span>
                        </div>
                      </div>

                      {/* Sessions & Tags */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-border/60 text-slate-600 dark:text-slate-350 text-[10px] font-bold rounded-lg">
                            {trade.session}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-border/60 text-slate-600 dark:text-slate-350 text-[10px] font-bold rounded-lg max-w-[90px] truncate">
                            {trade.strategy}
                          </span>
                        </div>

                        <div className="flex gap-1">
                          {trade.mistake && (
                            <span className="px-1.5 py-0.5 bg-danger/10 border border-danger/30 text-danger rounded text-[9px] font-black uppercase">
                              Mistake
                            </span>
                          )}
                          {trade.followedRules && (
                            <span className="px-1.5 py-0.5 bg-success/10 border border-success/30 text-success rounded text-[9px] font-black uppercase">
                              Rules
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions Card Footer */}
                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-border/20">
                        <Link
                          to={`/trades/${trade._id}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          {lang === 'he' ? 'גרף ויומן' : 'Chart & journal'}
                        </Link>
                        <button
                          onClick={() => handleDeleteTrade(trade)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-danger/10 hover:text-danger text-slate-400 text-xs font-bold rounded-xl transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {lang === 'he' ? 'מחק' : 'Delete'}
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-400 italic bg-white dark:bg-card">
            {lang === 'he' ? 'אין עסקאות התואמות למסננים שנבחרו.' : 'No trades match the selected filters.'}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-card border-t border-slate-200 dark:border-border">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'he' ? (
                <span>
                  מציג <span className="font-bold text-slate-850 dark:text-white">{trades.length}</span> מתוך{' '}
                  <span className="font-bold text-slate-850 dark:text-white">{totalCount}</span> עסקאות
                </span>
              ) : (
                <span>
                  Showing <span className="font-bold text-slate-850 dark:text-white">{trades.length}</span> of{' '}
                  <span className="font-bold text-slate-850 dark:text-white">{totalCount}</span> trades
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-border text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-700 dark:text-slate-300 px-2 font-bold">
                {lang === 'he' ? `עמוד ${currentPage} מתוך ${totalPages}` : `Page ${currentPage} of ${totalPages}`}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-border text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Lightbox Image Modal */}
      {zoomImage && (
        <div 
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-fade-in"
          onClick={() => setZoomImage(null)}
        >
          {/* Top Control Bar */}
          <div 
            className="w-full max-w-5xl flex items-center justify-between pb-3 border-b border-white/10 mb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400">{lang === 'he' ? 'גודל תמונה:' : 'Image Size:'}</span>
              <select
                value={zoomScale}
                onChange={(e) => setZoomScale(Number(e.target.value))}
                className="bg-slate-900 border border-white/10 px-2 py-1 rounded text-xs text-white"
              >
                <option value={50}>50% Scale</option>
                <option value={75}>75% Scale</option>
                <option value={100}>100% (Fit Screen)</option>
                <option value={150}>150% Zoom</option>
                <option value={200}>200% Zoom</option>
              </select>
            </div>
            <button
              onClick={() => setZoomImage(null)}
              className="p-1.5 bg-slate-900 border border-white/10 hover:bg-slate-800 text-white rounded-lg transition"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Scalable Image Container */}
          <div 
            className="flex-1 flex items-center justify-center overflow-auto w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={zoomImage} 
              alt="Zoomed Chart Screenshot" 
              style={{ width: `${zoomScale}%`, maxWidth: 'none' }}
              className="object-contain rounded-lg shadow-2xl transition-all duration-300"
            />
          </div>
        </div>
      )}

    </div>
  );
};
export default Trades;
