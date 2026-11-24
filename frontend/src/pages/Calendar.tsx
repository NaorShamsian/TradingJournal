import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Info,
  Clock,
  ArrowRight,
  X,
  RefreshCw
} from 'lucide-react';
import api from '../services/api';
import { CalendarDaySummary, Trade, Settings, GroupedTrade } from '../types';
import { formatCurrency, calculateTradeRR, formatRR } from '../utils/format';
import { useThemeLang } from '../context/ThemeLangContext';
import { MergedBadge, outcomeSurface } from '../components/Outcome';

export const Calendar: React.FC = () => {
  const { t, lang } = useThemeLang();
  const [calendarStats, setCalendarStats] = useState<CalendarDaySummary[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // Calendar Navigation State
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Selected Day state
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [selectedDayTrades, setSelectedDayTrades] = useState<Trade[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      const [statsRes, settingsRes] = await Promise.all([
        api.getCalendarStats(),
        api.getSettings(),
      ]);
      setCalendarStats(statsRes);
      setSettings(settingsRes);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarData();
  }, []);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const monthNamesEN = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthNamesHE = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];
  const monthNames = lang === 'he' ? monthNamesHE : monthNamesEN;

  const weekdayNames = lang === 'he' 
    ? ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Calendar math
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

  // Generate date keys YYYY-MM-DD
  const formatDateKey = (dayNum: number): string => {
    const year = currentYear;
    const month = String(currentMonth + 1).padStart(2, '0');
    const day = String(dayNum).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Convert calendar summary array to dictionary
  const statsMap: { [key: string]: CalendarDaySummary } = {};
  calendarStats.forEach(stat => {
    statsMap[stat._id] = stat;
  });

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
    setSelectedDateStr(null);
    setSelectedDayTrades([]);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
    setSelectedDateStr(null);
    setSelectedDayTrades([]);
  };

  const handleDayClick = async (dateStr: string, hasTrades: boolean) => {
    setSelectedDateStr(dateStr);
    if (!hasTrades) {
      setSelectedDayTrades([]);
      return;
    }
    
    try {
      setLoadingTrades(true);
      const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
      
      const res = await api.getTrades({
        startDate: startOfDay.toISOString(),
        endDate: endOfDay.toISOString(),
        limit: 100
      });
      
      setSelectedDayTrades(res.trades);
    } catch (err) {
      console.error('Error fetching trades for day:', err);
    } finally {
      setLoadingTrades(false);
    }
  };

  // Calculate monthly stats
  let monthlyNet = 0;
  let monthlyWins = 0;
  let monthlyLosses = 0;
  let monthlyTradesCount = 0;

  for (let i = 1; i <= daysInMonth; i++) {
    const dateKey = formatDateKey(i);
    const dayData = statsMap[dateKey];
    if (dayData) {
      monthlyNet += dayData.netProfit;
      monthlyWins += dayData.winCount;
      monthlyLosses += dayData.lossCount;
      monthlyTradesCount += dayData.tradeCount;
    }
  }

  const currency = settings?.currency || 'USD';
  const startingBalance = settings?.defaultBalance || 25000;
  const riskPercent = settings?.riskPerTradePercent || 1.0;

  // Render grid
  const days = [];
  
  // Fill leading empty tiles
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(
      <div key={`empty-${i}`} className="bg-slate-200/20 dark:bg-slate-950/20 border border-slate-200/50 dark:border-border/30 rounded-lg min-h-[80px]" />
    );
  }

  // Fill actual month days
  for (let i = 1; i <= daysInMonth; i++) {
    const dateKey = formatDateKey(i);
    const dayData = statsMap[dateKey];
    const isSelected = selectedDateStr === dateKey;

    let tileColor = 'bg-white dark:bg-card hover:bg-slate-100 dark:hover:bg-slate-800/40 border-slate-200 dark:border-border/40';
    let pnlText = '';
    let hasTrades = false;

    if (dayData) {
      hasTrades = true;
      if (dayData.netProfit > 0) {
        tileColor = isSelected 
          ? 'bg-success/20 border-success/80 ring-2 ring-success/20' 
          : 'bg-success/10 border-success/20 dark:border-success/30 hover:bg-success/15';
        pnlText = `+${formatCurrency(dayData.netProfit, currency)}`;
      } else if (dayData.netProfit < 0) {
        tileColor = isSelected 
          ? 'bg-danger/20 border-danger/80 ring-2 ring-danger/20' 
          : 'bg-danger/10 border-danger/20 dark:border-danger/30 hover:bg-danger/15';
        pnlText = formatCurrency(dayData.netProfit, currency);
      } else {
        tileColor = isSelected 
          ? 'bg-slate-200 dark:bg-slate-800 border-slate-400' 
          : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-border';
        pnlText = '$0.00';
      }
    } else {
      if (isSelected) {
        tileColor = 'bg-slate-200 dark:bg-slate-800 border-slate-400 ring-2 ring-slate-700/50';
      }
    }

    days.push(
      <div
        key={`day-${i}`}
        onClick={() => handleDayClick(dateKey, hasTrades)}
        className={`calendar-tile border cursor-pointer flex flex-col justify-between p-2 min-h-[85px] transition-all rounded-lg select-none text-slate-800 dark:text-slate-100 ${tileColor}`}
      >
        <span className={`text-[10px] font-bold ${isSelected ? 'text-primary dark:text-white font-black' : 'text-slate-400'}`}>
          {i}
        </span>
        
        {dayData && (
          <div className="text-left mt-2">
            <span className={`text-[10px] md:text-[11px] font-black block truncate ${dayData.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
              {pnlText}
            </span>
            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5">
              {dayData.tradeCount} {lang === 'he' ? 'עסקאות' : 'trades'}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-slate-100">
      {/* Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">{t('calendar')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-1">
          {lang === 'he' ? 'ניתוח פילוח רווחיות לפי ימים בלוח שנה אינטראקטיבי.' : 'Analyze daily PnL distribution inside a visual monthly grid.'}
        </p>
      </div>

      {/* Month Selection Bar and Monthly Stats Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Month Selector Grid */}
        <div className="lg:col-span-2 glass-panel p-5 rounded-2xl flex items-center justify-between bg-white dark:bg-card border-slate-200 dark:border-border">
          <button
            onClick={handlePrevMonth}
            className="p-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-border rounded-xl text-slate-700 dark:text-slate-300 transition"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            {monthNames[currentMonth]} {currentYear}
          </h2>
          
          <button
            onClick={handleNextMonth}
            className="p-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-border rounded-xl text-slate-700 dark:text-slate-300 transition"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Monthly Summary Statistics */}
        <div className="glass-panel p-5 rounded-2xl flex items-center justify-around gap-4 text-center bg-white dark:bg-card border-slate-200 dark:border-border">
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">{lang === 'he' ? 'רווח החודש' : 'Month P&L'}</span>
            <p className={`text-base font-black mt-1 ${monthlyNet >= 0 ? 'text-success' : 'text-danger'}`}>
              {monthlyNet >= 0 ? '+' : ''}{formatCurrency(monthlyNet, currency)}
            </p>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-border/60" />
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">{t('totalTrades')}</span>
            <p className="text-base font-black text-slate-900 dark:text-white mt-1">{monthlyTradesCount}</p>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-border/60" />
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">{t('winRate')}</span>
            <p className="text-base font-black text-slate-900 dark:text-white mt-1">
              {monthlyTradesCount > 0 ? ((monthlyWins / monthlyTradesCount) * 100).toFixed(0) + '%' : '0%'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid Calendar Container */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-card">
        {/* Weekday Names Header */}
        <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          {weekdayNames.map(day => (
            <div key={day}>{day}</div>
          ))}
        </div>

        {/* Month Day Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold">{lang === 'he' ? 'יוצר לוח שנה...' : 'Building calendar grid...'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {days}
          </div>
        )}
      </div>

      {/* Selected Day Inspect Modal Popup */}
      {selectedDateStr && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedDateStr(null)}
        >
          <div 
            className="glass-panel p-6 rounded-2xl border border-slate-200 dark:border-border/80 space-y-4 max-w-2xl w-full shadow-2xl relative bg-white dark:bg-card text-slate-800 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedDateStr(null)}
              className="absolute top-4 right-4 p-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg transition"
              title={t('close')}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center justify-between border-b border-slate-200 dark:border-border pb-3 pr-8">
              <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Info className="h-4.5 w-4.5 text-primary" />
                {t('tradesExecutedOn')} <span className="text-primary font-black">{selectedDateStr}</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">{selectedDayTrades.length} {lang === 'he' ? 'עסקאות' : 'trade(s)'}</span>
            </div>

            {loadingTrades ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-500 dark:text-slate-400 text-xs">
                <Clock className="h-4 w-4 animate-spin text-primary" />
                {lang === 'he' ? 'טוען עסקאות...' : 'Loading trade records...'}
              </div>
            ) : selectedDayTrades.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
                {selectedDayTrades.map((t) => {
                  const calculatedRR = calculateTradeRR(t.netProfit, startingBalance, riskPercent);
                  return (
                    <div key={t._id} className={`p-4 border rounded-xl flex items-center justify-between transition ${outcomeSurface(t.netProfit)}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 dark:text-white text-sm">{t.symbol}</span>
                          <MergedBadge positions={(t as GroupedTrade).positionsCount} lang={lang} />
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                            t.type === 'BUY' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                          }`}>
                            {t.type}
                          </span>
                          <span className="text-xs text-slate-500 font-mono font-bold">{t.volume.toFixed(2)} lot</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 flex gap-2 font-semibold">
                          <span>Entry: {t.entryPrice.toFixed(5)}</span>
                          <span>•</span>
                          <span>Exit: {t.exitPrice.toFixed(5)}</span>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-3">
                        <div>
                          <span className={`text-sm font-black block ${t.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                            {t.netProfit >= 0 ? '+' : ''}{formatCurrency(t.netProfit, currency)}
                          </span>
                          <span className={`text-[10px] font-bold block ${calculatedRR >= 0 ? 'text-success' : 'text-danger'}`}>
                            {formatRR(calculatedRR)}
                          </span>
                        </div>
                        <Link
                          to={`/trades/${t._id}`}
                          className="p-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition"
                          title="Inspect Journal"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-500 text-xs py-8 text-center">{lang === 'he' ? 'אין פעילות מסחר ביום זה.' : 'No trading activity recorded on this day.'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default Calendar;
