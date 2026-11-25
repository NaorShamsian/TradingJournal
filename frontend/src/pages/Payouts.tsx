import React, { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Banknote, ArrowUpFromLine, ArrowDownToLine, Scale, RefreshCw, AlertTriangle, Trophy } from 'lucide-react';
import api from '../services/api';
import { CashflowResponse } from '../types';
import { formatCurrency } from '../utils/format';
import { useThemeLang } from '../context/ThemeLangContext';

type Granularity = 'day' | 'month' | 'quarter' | 'year';
type OpFilter = 'all' | 'withdrawals' | 'deposits';

const COLORS = { withdrawal: '#f59e0b', deposit: '#3b82f6', cumulative: '#7c3aed' };

interface Bucket {
  key: string;
  start: number;
  withdrawn: number;
  withdrawCount: number;
  deposited: number;
  depositCount: number;
  cumulativeWithdrawn: number;
}

// Operation times are MT5 server time stored as UTC, so buckets use UTC getters.
const bucketKey = (d: Date, g: Granularity) => {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (g === 'year') return `${y}`;
  if (g === 'quarter') return `${y}-Q${Math.floor(m / 3) + 1}`;
  if (g === 'month') return `${y}-${String(m + 1).padStart(2, '0')}`;
  return d.toISOString().slice(0, 10);
};

const bucketStart = (d: Date, g: Granularity) => {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (g === 'year') return Date.UTC(y, 0, 1);
  if (g === 'quarter') return Date.UTC(y, Math.floor(m / 3) * 3, 1);
  if (g === 'month') return Date.UTC(y, m, 1);
  return Date.UTC(y, m, d.getUTCDate());
};

const nextBucket = (ts: number, g: Granularity) => {
  const d = new Date(ts);
  if (g === 'year') return Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  if (g === 'quarter') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); // month
};

export const Payouts: React.FC = () => {
  const { lang, theme } = useThemeLang();
  const he = lang === 'he';
  const locale = he ? 'he-IL' : 'en-US';

  const [data, setData] = useState<CashflowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [showDeposits, setShowDeposits] = useState(true);
  const [opFilter, setOpFilter] = useState<OpFilter>('all');

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await api.getCashflow());
    } catch (err: any) {
      setError(err.message || 'Failed to load deposits and withdrawals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const currency = data?.currency || 'USD';
  const fmt = (v: number) => formatCurrency(v, currency);

  const labelOf = (start: number, g: Granularity) => {
    const d = new Date(start);
    if (g === 'year') return String(d.getUTCFullYear());
    if (g === 'quarter') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
    if (g === 'month') return d.toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
  };
  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

  const ops = useMemo(() => (data?.ops || []).map((o) => ({ ...o, ts: new Date(o.time).getTime() })), [data]);

  // Per-period totals, with empty periods filled in so the scale is continuous
  const buckets: Bucket[] = useMemo(() => {
    if (!ops.length) return [];
    const map = new Map<string, Bucket>();
    ops.forEach((o) => {
      const d = new Date(o.ts);
      const key = bucketKey(d, granularity);
      const b = map.get(key) || {
        key, start: bucketStart(d, granularity), withdrawn: 0, withdrawCount: 0, deposited: 0, depositCount: 0, cumulativeWithdrawn: 0,
      };
      if (o.amount < 0) {
        b.withdrawn += -o.amount;
        b.withdrawCount++;
      } else {
        b.deposited += o.amount;
        b.depositCount++;
      }
      map.set(key, b);
    });

    if (granularity !== 'day') {
      const first = bucketStart(new Date(ops[0].ts), granularity);
      const last = bucketStart(new Date(), granularity);
      for (let ts = first; ts <= last; ts = nextBucket(ts, granularity)) {
        const key = bucketKey(new Date(ts), granularity);
        if (!map.has(key)) {
          map.set(key, { key, start: ts, withdrawn: 0, withdrawCount: 0, deposited: 0, depositCount: 0, cumulativeWithdrawn: 0 });
        }
      }
    }

    const list = Array.from(map.values()).sort((a, b) => a.start - b.start);
    let cumulative = 0;
    list.forEach((b) => {
      b.withdrawn = Math.round(b.withdrawn * 100) / 100;
      b.deposited = Math.round(b.deposited * 100) / 100;
      cumulative += b.withdrawn;
      b.cumulativeWithdrawn = Math.round(cumulative * 100) / 100;
    });
    return list;
  }, [ops, granularity]);

  const chartData = buckets.map((b) => ({ ...b, label: labelOf(b.start, granularity) }));
  const activeBuckets = [...buckets].filter((b) => b.withdrawCount || b.depositCount).reverse();
  const maxBucketWithdrawn = Math.max(1, ...buckets.map((b) => b.withdrawn));

  const withdrawals = ops.filter((o) => o.amount < 0);
  const largest = withdrawals.reduce<(typeof ops)[number] | null>((m, o) => (!m || o.amount < m.amount ? o : m), null);
  const lastWithdrawal = withdrawals.length ? withdrawals[withdrawals.length - 1] : null;
  const daysSinceLast = lastWithdrawal ? Math.floor((Date.now() - lastWithdrawal.ts) / 86400000) : null;
  const bestBucket = buckets.reduce<Bucket | null>((m, b) => (!m || b.withdrawn > m.withdrawn ? b : m), null);

  const totals = data?.totals || { deposits: 0, depositCount: 0, withdrawals: 0, withdrawalCount: 0 };
  const netOut = Math.round((totals.withdrawals - totals.deposits) * 100) / 100;
  const avgWithdrawal = totals.withdrawalCount ? totals.withdrawals / totals.withdrawalCount : 0;
  const shareOfProfit = data && data.tradingPnL > 0 ? (netOut / data.tradingPnL) * 100 : null;

  const filteredOps = [...ops]
    .filter((o) => opFilter === 'all' || (opFilter === 'withdrawals' ? o.amount < 0 : o.amount > 0))
    .reverse();

  const dark = theme === 'dark';
  const tooltipStyle = {
    background: dark ? '#0e0f1e' : '#ffffff',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
    borderRadius: '12px',
  };
  const axisColor = dark ? 'rgba(148,163,184,0.7)' : 'rgba(71,85,105,0.8)';
  const gridColor = dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)';

  const card = 'p-5 rounded-2xl bg-white dark:bg-card border border-slate-200 dark:border-border shadow-sm';
  const label = 'text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';

  const granularityLabel: Record<Granularity, string> = he
    ? { day: 'יום', month: 'חודש', quarter: 'רבעון', year: 'שנה' }
    : { day: 'Day', month: 'Month', quarter: 'Quarter', year: 'Year' };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
        <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold">{he ? 'טוען משיכות והפקדות...' : 'Loading withdrawals...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${card} max-w-lg mx-auto text-center mt-10`}>
        <AlertTriangle className="h-10 w-10 text-danger mx-auto mb-3" />
        <p className="font-bold text-slate-900 dark:text-white">{error}</p>
        <button onClick={load} className="mt-4 px-5 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-bold rounded-xl">
          {he ? 'נסה שוב' : 'Try again'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
            {he ? 'משיכות והפקדות' : 'Withdrawals & Deposits'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-1">
            {he
              ? 'כמה כסף משכת מהחשבון ומתי. הנתונים מסונכרנים אוטומטית מ-MT5.'
              : 'How much you took out of the account, and when. Synced automatically from MT5.'}
          </p>
        </div>
        <div className="inline-flex p-1 rounded-xl bg-slate-200/60 dark:bg-slate-900 border border-slate-200 dark:border-border self-start md:self-auto" role="tablist">
          {(['day', 'month', 'quarter', 'year'] as Granularity[]).map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={granularity === g}
              onClick={() => setGranularity(g)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition ${
                granularity === g ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {granularityLabel[g]}
            </button>
          ))}
        </div>
      </div>

      {ops.length === 0 ? (
        <div className={`${card} text-center py-14`}>
          <Banknote className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <p className="font-bold text-slate-900 dark:text-white">{he ? 'עוד אין הפקדות או משיכות' : 'No deposits or withdrawals yet'}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {he ? 'הן יופיעו כאן אוטומטית אחרי הסנכרון הבא מ-MT5.' : 'They will appear here after the next MT5 sync.'}
          </p>
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className={card}>
              <div className="flex items-start justify-between">
                <span className={label}>{he ? 'סה"כ משכת' : 'Total withdrawn'}</span>
                <span className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500"><ArrowUpFromLine className="h-4 w-4" /></span>
              </div>
              <p className="text-2xl md:text-3xl font-black mt-2 tabular-nums" style={{ color: COLORS.withdrawal }}>{fmt(totals.withdrawals)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                {totals.withdrawalCount} {he ? 'משיכות' : 'withdrawals'}
                {lastWithdrawal && (
                  <> · {he ? 'אחרונה לפני' : 'last'} {daysSinceLast} {he ? 'ימים' : 'days ago'}</>
                )}
              </p>
            </div>

            <div className={card}>
              <div className="flex items-start justify-between">
                <span className={label}>{he ? 'ממוצע למשיכה' : 'Average withdrawal'}</span>
                <span className="p-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary"><Trophy className="h-4 w-4" /></span>
              </div>
              <p className="text-2xl md:text-3xl font-black mt-2 tabular-nums text-slate-900 dark:text-white">{fmt(avgWithdrawal)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                {largest && (
                  <>{he ? 'הגדולה:' : 'Largest:'} <span className="tabular-nums">{fmt(-largest.amount)}</span> · {labelOf(largest.ts, 'day')}</>
                )}
              </p>
            </div>

            <div className={card}>
              <div className="flex items-start justify-between">
                <span className={label}>{he ? 'סה"כ הפקדות' : 'Total deposited'}</span>
                <span className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-500"><ArrowDownToLine className="h-4 w-4" /></span>
              </div>
              <p className="text-2xl md:text-3xl font-black mt-2 tabular-nums" style={{ color: COLORS.deposit }}>{fmt(totals.deposits)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                {totals.depositCount} {he ? 'הפקדות' : 'deposits'}
              </p>
            </div>

            <div className={card}>
              <div className="flex items-start justify-between">
                <span className={label}>{he ? 'משכת נטו' : 'Net taken out'}</span>
                <span className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-border text-slate-500"><Scale className="h-4 w-4" /></span>
              </div>
              <p className={`text-2xl md:text-3xl font-black mt-2 tabular-nums ${netOut >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {netOut > 0 ? '+' : ''}{fmt(netOut)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                {netOut >= 0
                  ? (he ? 'יותר ממה שהפקדת' : 'more than you deposited')
                  : (he ? 'עדיין פחות ממה שהפקדת' : 'still less than you deposited')}
                {shareOfProfit !== null && netOut > 0 && (
                  <> · {shareOfProfit.toFixed(0)}% {he ? 'מרווח המסחר' : 'of trading profit'}</>
                )}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white">
                  {he ? `משיכות לפי ${granularityLabel[granularity]}` : `Withdrawals per ${granularityLabel[granularity].toLowerCase()}`}
                </h3>
                {bestBucket && bestBucket.withdrawn > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                    {he ? 'השיא:' : 'Best:'} <span className="font-black" style={{ color: COLORS.withdrawal }}>{fmt(bestBucket.withdrawn)}</span>{' '}
                    {he ? 'ב-' : 'in '}{labelOf(bestBucket.start, granularity)}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  id="show-deposits"
                  type="checkbox"
                  checked={showDeposits}
                  onChange={(e) => setShowDeposits(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                {he ? 'הצג גם הפקדות' : 'Show deposits'}
              </label>
            </div>
            <div className="h-80 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="label" stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} minTickGap={12} />
                  <YAxis
                    yAxisId="amount"
                    stroke={axisColor}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={(v) => `$${Math.round(Number(v)).toLocaleString('en-US')}`}
                  />
                  <YAxis
                    yAxisId="cumulative"
                    orientation="right"
                    stroke={COLORS.cumulative}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={(v) => `$${Math.round(Number(v)).toLocaleString('en-US')}`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}
                    itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                    cursor={{ fill: dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }}
                    formatter={(value: any, name: any) => [fmt(Number(value)), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 600 }} />
                  <Bar
                    yAxisId="amount"
                    dataKey="withdrawn"
                    name={he ? 'משיכות' : 'Withdrawals'}
                    fill={COLORS.withdrawal}
                    radius={[5, 5, 0, 0]}
                    maxBarSize={44}
                    isAnimationActive={false}
                  />
                  {showDeposits && (
                    <Bar
                      yAxisId="amount"
                      dataKey="deposited"
                      name={he ? 'הפקדות' : 'Deposits'}
                      fill={COLORS.deposit}
                      radius={[5, 5, 0, 0]}
                      maxBarSize={44}
                    isAnimationActive={false}
                    />
                  )}
                  <Line
                    yAxisId="cumulative"
                    type="monotone"
                    dataKey="cumulativeWithdrawn"
                    name={he ? 'סה"כ משיכות מצטבר' : 'Cumulative withdrawn'}
                    stroke={COLORS.cumulative}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Per-period breakdown with an inline scale */}
            <div className={card}>
              <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white mb-3">
                {he ? `פירוט לפי ${granularityLabel[granularity]}` : `By ${granularityLabel[granularity].toLowerCase()}`}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start border-b border-slate-200 dark:border-border">
                      <th className={`${label} py-2 text-start`}>{he ? 'תקופה' : 'Period'}</th>
                      <th className={`${label} py-2 text-start`}>{he ? 'נמשך' : 'Withdrawn'}</th>
                      <th className={`${label} py-2 text-start`}>{he ? 'הופקד' : 'Deposited'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBuckets.map((b) => (
                      <tr key={b.key} className="border-b border-slate-100 dark:border-border/50 last:border-0">
                        <td className="py-2.5 pe-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">{labelOf(b.start, granularity)}</td>
                        <td className="py-2.5 pe-3 w-1/2">
                          {b.withdrawn > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${(b.withdrawn / maxBucketWithdrawn) * 100}%`, background: COLORS.withdrawal }}
                                />
                              </div>
                              <span className="font-black tabular-nums whitespace-nowrap" style={{ color: COLORS.withdrawal }}>{fmt(b.withdrawn)}</span>
                              <span className="text-[11px] text-slate-400 whitespace-nowrap">×{b.withdrawCount}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 font-bold tabular-nums whitespace-nowrap" style={{ color: b.deposited > 0 ? COLORS.deposit : undefined }}>
                          {b.deposited > 0 ? fmt(b.deposited) : <span className="text-slate-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Operations log */}
            <div className={card}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white">{he ? 'כל הפעולות' : 'All operations'}</h3>
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border">
                  {(['all', 'withdrawals', 'deposits'] as OpFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setOpFilter(f)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                        opFilter === f ? 'bg-primary text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {f === 'all' ? (he ? 'הכל' : 'All') : f === 'withdrawals' ? (he ? 'משיכות' : 'Withdrawals') : (he ? 'הפקדות' : 'Deposits')}
                    </button>
                  ))}
                </div>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-border/50 max-h-[420px] overflow-y-auto">
                {filteredOps.map((o, i) => {
                  const isWithdrawal = o.amount < 0;
                  return (
                    <li key={`${o.time}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`p-1.5 rounded-lg border flex-shrink-0 ${
                            isWithdrawal ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-blue-500/10 border-blue-500/30 text-blue-500'
                          }`}
                        >
                          {isWithdrawal ? <ArrowUpFromLine className="h-3.5 w-3.5" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{isWithdrawal ? (he ? 'משיכה' : 'Withdrawal') : (he ? 'הפקדה' : 'Deposit')}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{formatDateTime(o.time)}</p>
                        </div>
                      </div>
                      <span className="font-black tabular-nums whitespace-nowrap" dir="ltr" style={{ color: isWithdrawal ? COLORS.withdrawal : COLORS.deposit }}>
                        {isWithdrawal ? '−' : '+'}{fmt(Math.abs(o.amount))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Payouts;
