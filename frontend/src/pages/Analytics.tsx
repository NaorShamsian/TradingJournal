import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import { Settings } from '../types';
import { formatCurrency, formatPercent } from '../utils/format';
import { useThemeLang } from '../context/ThemeLangContext';

interface StrategyStat {
  strategy: string;
  count: number;
  winRate: number;
  netProfit: number;
}

interface SessionStat {
  session: string;
  count: number;
  winRate: number;
  netProfit: number;
}

interface MistakeStat {
  tag: string;
  count: number;
  netProfit: number;
}

export const Analytics: React.FC = () => {
  const { t, lang, theme } = useThemeLang();
  const tooltipBg = theme === 'dark' ? 'rgb(14 15 30)' : '#ffffff';
  const tooltipBorder = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const tooltipText = theme === 'dark' ? '#ffffff' : '#1e293b';
  const [strategyStats, setStrategyStats] = useState<StrategyStat[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStat[]>([]);
  const [mistakeStats, setMistakeStats] = useState<MistakeStat[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const [tradesRes, settingsRes] = await Promise.all([
        api.getTrades({ limit: 1000 }),
        api.getSettings()
      ]);

      const trades = tradesRes.trades || [];
      setSettings(settingsRes);

      // 1. Process Strategy Stats
      const stratMap: { [key: string]: { count: number; wins: number; netProfit: number } } = {};
      // 2. Process Session Stats
      const sessionMap: { [key: string]: { count: number; wins: number; netProfit: number } } = {
        'Asia': { count: 0, wins: 0, netProfit: 0 },
        'London': { count: 0, wins: 0, netProfit: 0 },
        'New York': { count: 0, wins: 0, netProfit: 0 },
        'Other': { count: 0, wins: 0, netProfit: 0 },
      };
      // 3. Process Mistakes
      const mistakeMap: { [key: string]: { count: number; netProfit: number } } = {};

      trades.forEach(t => {
        // Strategy mapping
        const strat = t.strategy || 'Unassigned';
        if (!stratMap[strat]) {
          stratMap[strat] = { count: 0, wins: 0, netProfit: 0 };
        }
        stratMap[strat].count++;
        if (t.netProfit > 0) stratMap[strat].wins++;
        stratMap[strat].netProfit += t.netProfit;

        // Session mapping
        const sess = t.session || 'Other';
        if (!sessionMap[sess]) {
          sessionMap[sess] = { count: 0, wins: 0, netProfit: 0 };
        }
        sessionMap[sess].count++;
        if (t.netProfit > 0) sessionMap[sess].wins++;
        sessionMap[sess].netProfit += t.netProfit;

        // Mistakes mapping
        if (t.mistake && t.mistakeTags) {
          t.mistakeTags.forEach(tag => {
            if (!mistakeMap[tag]) {
              mistakeMap[tag] = { count: 0, netProfit: 0 };
            }
            mistakeMap[tag].count++;
            mistakeMap[tag].netProfit += t.netProfit;
          });
        }
      });

      // Format arrays
      const formattedStrats: StrategyStat[] = Object.entries(stratMap).map(([strategy, data]) => ({
        strategy,
        count: data.count,
        winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
        netProfit: Number(data.netProfit.toFixed(2))
      })).sort((a, b) => b.netProfit - a.netProfit);

      const formattedSessions: SessionStat[] = Object.entries(sessionMap)
        .filter(([_, data]) => data.count > 0)
        .map(([session, data]) => ({
          session,
          count: data.count,
          winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
          netProfit: Number(data.netProfit.toFixed(2))
        }));

      const formattedMistakes: MistakeStat[] = Object.entries(mistakeMap).map(([tag, data]) => ({
        tag,
        count: data.count,
        netProfit: Number(data.netProfit.toFixed(2))
      })).sort((a, b) => b.count - a.count);

      setStrategyStats(formattedStrats);
      setSessionStats(formattedSessions);
      setMistakeStats(formattedMistakes);

    } catch (err) {
      console.error('Error calculating analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const currency = settings?.currency || 'USD';
  const COLORS = ['#7c3aed', '#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899'];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
        <p className="text-slate-400 text-sm font-semibold">{lang === 'he' ? 'מעבד אנליזה ונתונים...' : 'Processing breakdowns and metrics...'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-slate-800 dark:text-slate-100">
      
      {/* Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">{t('analytics')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-1">
          {lang === 'he' ? 'ניתוח פילוח רווחיות לפי אסטרטגיות וזמני פעילות.' : 'Analyze strategy, session, and discipline performance ratios.'}
        </p>
      </div>

      {/* Row 1: Strategy Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Strategy PnL Chart */}
        <div className="glass-panel p-5 rounded-2xl space-y-4 bg-white dark:bg-card border-slate-200 dark:border-border">
          <div>
            <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white">{lang === 'he' ? 'רווחיות לפי אסטרטגיה' : 'Profitability by Strategy'}</h3>
            <span className="text-xs text-slate-455">{lang === 'he' ? 'רווח/הפסד מצטבר ברוטו' : 'Cumulative Net P&L per strategy'}</span>
          </div>
          
          <div className="h-64 w-full">
            {strategyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={strategyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(124,58,237,0.06)" vertical={false} />
                  <XAxis dataKey="strategy" stroke="rgba(100,116,139,0.5)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(100,116,139,0.5)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                  <Tooltip
                    contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '12px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}
                    itemStyle={{ color: tooltipText, fontSize: '12px' }}
                    formatter={(value: any) => [formatCurrency(Number(value), currency), 'Net P&L']}
                  />
                  <Bar 
                    dataKey="netProfit" 
                    radius={[4, 4, 0, 0]}
                    children={strategyStats.map((entry, idx) => (
                      <rect key={`strat-${idx}`} fill={entry.netProfit >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 italic text-xs">{lang === 'he' ? 'אין עסקאות משויכות עדיין' : 'No trades assigned to strategies'}</div>
            )}
          </div>
        </div>

        {/* Strategy Win Rate Chart */}
        <div className="glass-panel p-5 rounded-2xl space-y-4 bg-white dark:bg-card border-slate-200 dark:border-border">
          <div>
            <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white">{lang === 'he' ? 'אחוז הצלחה לפי אסטרטגיה' : 'Win Rate by Strategy'}</h3>
            <span className="text-xs text-slate-455">{lang === 'he' ? 'שיעור הצלחה באחוזים' : 'Win percentage ratio'}</span>
          </div>

          <div className="h-64 w-full">
            {strategyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={strategyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(124,58,237,0.06)" vertical={false} />
                  <XAxis dataKey="strategy" stroke="rgba(100,116,139,0.5)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(100,116,139,0.5)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                  <Tooltip
                    contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '12px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}
                    itemStyle={{ color: tooltipText, fontSize: '12px' }}
                    formatter={(value: any) => [formatPercent(Number(value)), 'Win Rate']}
                  />
                  <Bar dataKey="winRate" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 italic text-xs">{lang === 'he' ? 'אין עסקאות משויכות עדיין' : 'No trades assigned to strategies'}</div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Session Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Session PnL Chart */}
        <div className="glass-panel p-5 rounded-2xl space-y-4 bg-white dark:bg-card border-slate-200 dark:border-border">
          <div>
            <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white">{lang === 'he' ? 'רווחיות לפי סשנים (Session)' : 'PnL by Trading Session'}</h3>
            <span className="text-xs text-slate-455">{lang === 'he' ? 'פילוח ביצועים לפי שעות השוק' : 'Performance by market hours'}</span>
          </div>

          <div className="h-64 w-full">
            {sessionStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sessionStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(124,58,237,0.06)" vertical={false} />
                  <XAxis dataKey="session" stroke="rgba(100,116,139,0.5)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(100,116,139,0.5)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                  <Tooltip
                    contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '12px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}
                    itemStyle={{ color: tooltipText, fontSize: '12px' }}
                    formatter={(value: any) => [formatCurrency(Number(value), currency), 'Net P&L']}
                  />
                  <Bar 
                    dataKey="netProfit" 
                    radius={[4, 4, 0, 0]}
                    children={sessionStats.map((entry, idx) => (
                      <rect key={`sess-${idx}`} fill={entry.netProfit >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 italic text-xs">{lang === 'he' ? 'אין עסקאות משויכות לסשן' : 'No trades matched with sessions'}</div>
            )}
          </div>
        </div>

        {/* Mistake Behavioral Distribution */}
        <div className="glass-panel p-5 rounded-2xl space-y-4 bg-white dark:bg-card border-slate-200 dark:border-border">
          <div>
            <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white">{lang === 'he' ? 'ניתוח פסיכולוגי וטעויות משמעת' : 'Mistakes Behavioral Review'}</h3>
            <span className="text-xs text-slate-455">{lang === 'he' ? 'פילוח עלות כספית לפי סוג טעות' : 'Capital lost by bad disciplines'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-64">
            {mistakeStats.length > 0 ? (
              <>
                {/* Pie Chart */}
                <div className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={mistakeStats}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="count"
                      >
                        {mistakeStats.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '12px' }}
                        itemStyle={{ color: tooltipText, fontSize: '12px' }}
                        formatter={(value: any, _name: any, props: any) => [`${value} times (${formatCurrency(props.payload.netProfit, currency)})`, props.payload.tag]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Custom Legend */}
                <div className="flex flex-col justify-center gap-2.5 overflow-y-auto max-h-full">
                  {mistakeStats.slice(0, 5).map((entry, idx) => (
                    <div key={entry.tag} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-md flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <div className="text-xs truncate w-full flex justify-between font-bold">
                        <span className="text-slate-800 dark:text-slate-300">{entry.tag}</span>
                        <span className="text-danger ml-2">{formatCurrency(entry.netProfit, currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="col-span-2 flex flex-col items-center justify-center gap-2 text-slate-400 italic text-xs h-full">
                <CheckCircle2 className="h-8 w-8 text-success" />
                <span>{lang === 'he' ? 'אין טעויות משמעת רשומות. משמעת מצוינת!' : 'No mistake tags recorded. Great trading discipline!'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Analytics;
