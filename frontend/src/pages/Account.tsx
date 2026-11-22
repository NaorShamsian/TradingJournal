import React, { useCallback, useEffect, useState } from 'react';
import {
  Wallet,
  Save,
  RefreshCw,
  Database,
  Activity,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Pencil,
  Download,
} from 'lucide-react';
import api from '../services/api';
import { MT5Account, SystemHealth, SyncStatus, BalanceSource, StatsSummary } from '../types';
import { formatCurrency } from '../utils/format';
import { useThemeLang } from '../context/ThemeLangContext';

const inputCls =
  'w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 font-semibold disabled:opacity-50';
const labelCls = 'text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5';
const panelCls = 'glass-panel p-6 rounded-2xl bg-white dark:bg-card border-slate-200 dark:border-border';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const AccountPage: React.FC = () => {
  const { lang } = useThemeLang();
  const he = lang === 'he';

  const [account, setAccount] = useState<MT5Account | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [balanceSource, setBalanceSource] = useState<BalanceSource>('manual');
  const [balance, setBalance] = useState(0);
  const [riskPercent, setRiskPercent] = useState(1);
  const [riskAmount, setRiskAmount] = useState(0);
  const [syncDepth, setSyncDepth] = useState<MT5Account['syncHistoryDepth']>('all');

  const fillForm = (acc: MT5Account) => {
    setName(acc.name || '');
    setBalanceSource(acc.balanceSource || 'manual');
    setBalance(acc.defaultBalance);
    setRiskPercent(acc.riskPerTradePercent);
    setRiskAmount(round2((acc.defaultBalance * acc.riskPerTradePercent) / 100));
    setSyncDepth(acc.syncHistoryDepth || 'all');
  };

  const load = useCallback(async (resetForm: boolean) => {
    try {
      const [accounts, healthRes, syncRes, settingsRes, summaryRes] = await Promise.all([
        api.getAccounts(),
        api.getHealth(),
        api.getSyncStatus(),
        api.getSettings(),
        api.getStatsSummary(),
      ]);
      const active: MT5Account | undefined = accounts.find((a: MT5Account) => a.isActive);
      setAccount(active || null);
      setHealth(healthRes);
      setSyncStatus(syncRes);
      setSummary(summaryRes);
      setCurrency(settingsRes.currency || 'USD');
      if (active && resetForm) fillForm(active);
      return healthRes;
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load account data' });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  // While a sync is running, keep refreshing the status cards
  useEffect(() => {
    if (!syncing && !health?.syncInProgress) return;
    const id = setInterval(async () => {
      const h = await load(false);
      if (h && !h.syncInProgress) {
        setSyncing(false);
        // Pull the (possibly MT5-updated) balance into the form
        const accounts = await api.getAccounts();
        const active = accounts.find((a: MT5Account) => a.isActive);
        if (active) {
          setAccount(active);
          if (active.balanceSource !== 'manual') {
            setBalance(active.defaultBalance);
            setRiskAmount(round2((active.defaultBalance * riskPercent) / 100));
          }
        }
      }
    }, 3000);
    return () => clearInterval(id);
  }, [syncing, health?.syncInProgress, load, riskPercent]);

  const info = account?.mt5Info;
  const netDeposits = info?.totalDeposits !== undefined ? round2((info.totalDeposits || 0) - (info.totalWithdrawals || 0)) : undefined;

  const balanceFor = (src: BalanceSource): number | undefined => {
    if (src === 'mt5_first_deposit') return info?.firstDeposit;
    if (src === 'mt5_net_deposits') return netDeposits;
    return undefined;
  };

  const handleSourceChange = (src: BalanceSource) => {
    setBalanceSource(src);
    const mt5Value = balanceFor(src);
    if (mt5Value !== undefined) {
      setBalance(mt5Value);
      setRiskAmount(round2((mt5Value * riskPercent) / 100));
    }
  };

  const handleBalanceChange = (v: number) => {
    setBalance(v);
    setRiskAmount(round2((v * riskPercent) / 100));
  };

  const handleRiskPercentChange = (v: number) => {
    setRiskPercent(v);
    setRiskAmount(round2((balance * v) / 100));
  };

  const handleRiskAmountChange = (v: number) => {
    setRiskAmount(v);
    if (balance > 0) setRiskPercent(Math.round((v / balance) * 100 * 1000) / 1000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateAccount(account._id, {
        name,
        balanceSource,
        riskPerTradePercent: riskPercent,
        syncHistoryDepth: syncDepth,
        ...(balanceSource === 'manual' ? { defaultBalance: balance } : {}),
      });
      setAccount(updated);
      fillForm(updated);
      setMessage({ type: 'ok', text: he ? 'הגדרות החשבון נשמרו.' : 'Account settings saved.' });
      load(false);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setMessage(null);
    try {
      setSyncing(true);
      await api.triggerSync();
      load(false);
    } catch (err: any) {
      setSyncing(false);
      setMessage({ type: 'error', text: err.message });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Wallet className="h-8 w-8 text-primary animate-pulse" />
        <p className="text-slate-400 text-sm font-semibold">{he ? 'טוען נתוני חשבון...' : 'Loading account...'}</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center glass-panel rounded-2xl bg-white dark:bg-card">
        <Wallet className="h-10 w-10 text-primary mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{he ? 'אין חשבון פעיל' : 'No active account'}</h2>
        <p className="text-sm text-slate-500 mt-1">
          {he ? 'הוסף חשבון MT5 מהתפריט בצד כדי להתחיל.' : 'Add an MT5 account from the sidebar to get started.'}
        </p>
      </div>
    );
  }

  const mt5Balance = info?.balance;
  const currentBalance = mt5Balance ?? summary?.currentBalance ?? balance;
  const isSyncBusy = syncing || !!health?.syncInProgress;
  const fmt = (v?: number) => (v === undefined || v === null ? '—' : formatCurrency(v, currency));
  const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString(he ? 'he-IL' : 'en-GB') : '—');

  const sources: { value: BalanceSource; title: string; desc: string; amount?: number }[] = [
    {
      value: 'manual',
      title: he ? 'ידני' : 'Manual',
      desc: he ? 'אתה קובע את יתרת הפתיחה' : 'You set the starting balance',
    },
    {
      value: 'mt5_first_deposit',
      title: he ? 'הפקדה ראשונה (MT5)' : 'First deposit (MT5)',
      desc: he ? 'מתעדכן אוטומטית מ-MT5' : 'Auto-updated from MT5',
      amount: info?.firstDeposit,
    },
    {
      value: 'mt5_net_deposits',
      title: he ? 'הפקדות נטו (MT5)' : 'Net deposits (MT5)',
      desc: he ? 'הפקדות פחות משיכות' : 'Deposits minus withdrawals',
      amount: netDeposits,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
            {he ? 'חשבון וסיכון' : 'Account & Risk'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-1">
            {account.name || `Account ${account.login}`} · #{account.login} · {account.server}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncBusy}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-60 text-white text-sm font-bold rounded-xl transition shadow-lg shadow-primary/20"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncBusy ? 'animate-spin' : ''}`} />
          {isSyncBusy ? (he ? 'מסנכרן...' : 'Syncing...') : he ? 'סנכרן מ-MT5 עכשיו' : 'Sync from MT5 now'}
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
            message.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-danger/10 border-danger/20 text-danger'
          }`}
        >
          {message.type === 'ok' ? <CheckCircle2 className="h-4.5 w-4.5" /> : <AlertCircle className="h-4.5 w-4.5" />}
          {message.text}
        </div>
      )}

      {/* Live summary — mirrors the dashboard banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={panelCls + ' !p-5'}>
          <span className={labelCls}>{he ? 'יתרת פתיחה' : 'Starting Balance'}</span>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{fmt(balance)}</p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">{sources.find((s) => s.value === balanceSource)?.title}</p>
        </div>
        <div className={panelCls + ' !p-5'}>
          <span className={labelCls}>{he ? 'יתרת חשבון' : 'Account Balance'}</span>
          <p className="text-2xl font-black text-primary">{fmt(currentBalance)}</p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            {mt5Balance !== undefined ? (he ? 'חי מ-MT5' : 'Live from MT5') : he ? 'מחושב מהעסקאות' : 'Calculated from trades'}
          </p>
        </div>
        <div className={panelCls + ' !p-5'}>
          <span className={labelCls}>{he ? 'גודל סיכון (1R)' : 'Risk size (1R)'}</span>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{fmt(riskAmount)}</p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            {riskPercent}% {he ? 'מיתרת הפתיחה' : 'of starting balance'}
          </p>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className={panelCls + ' space-y-6'}>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-200 dark:border-border pb-2.5 flex items-center gap-2">
          <Pencil className="h-4.5 w-4.5 text-primary" />
          {he ? 'עריכת פרמטרים' : 'Edit parameters'}
        </h3>

        <div>
          <label className={labelCls}>{he ? 'שם החשבון' : 'Account name'}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>

        {/* Balance source */}
        <div>
          <label className={labelCls}>{he ? 'מקור יתרת הפתיחה' : 'Starting balance source'}</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {sources.map((s) => {
              const selected = balanceSource === s.value;
              const unavailable = s.value !== 'manual' && s.amount === undefined;
              return (
                <button
                  type="button"
                  key={s.value}
                  disabled={unavailable}
                  onClick={() => handleSourceChange(s.value)}
                  className={`text-start p-3.5 rounded-xl border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                    selected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-slate-200 dark:border-border hover:border-primary/50 bg-slate-50 dark:bg-slate-900/40'
                  }`}
                >
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">{s.title}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">{s.desc}</span>
                  {s.value !== 'manual' && (
                    <span className="block text-sm font-black text-primary mt-1.5">
                      {unavailable ? (he ? 'סנכרן כדי לטעון' : 'Sync to load') : fmt(s.amount)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className={labelCls}>{he ? 'יתרת פתיחה' : 'Starting balance'} ({currency})</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={balance}
              disabled={balanceSource !== 'manual'}
              onChange={(e) => handleBalanceChange(Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{he ? 'סיכון לעסקה (%)' : 'Risk per trade (%)'}</label>
            <input
              type="number"
              min={0.01}
              max={100}
              step="0.01"
              value={riskPercent}
              onChange={(e) => handleRiskPercentChange(Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{he ? '1R בדולרים' : '1R amount'} ({currency})</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={riskAmount}
              onChange={(e) => handleRiskAmountChange(Number(e.target.value))}
              className={inputCls}
            />
          </div>
        </div>

        <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 flex gap-3">
          <ShieldAlert className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            1R = <span className="text-primary font-black">{fmt(riskAmount)}</span> ({riskPercent}%{' '}
            {he ? 'מתוך' : 'of'} {fmt(balance)}).{' '}
            {he
              ? 'יחס ה-R של כל עסקה בדשבורד, ביומן ובלוח השנה מחושב לפי הסכום הזה. אפשר לשנות בכל זמן.'
              : 'Every trade’s R multiple on the dashboard, log and calendar is calculated from this. Change it any time.'}
          </p>
        </div>

        <div className="max-w-xs">
          <label className={labelCls}>{he ? 'עומק היסטוריה בסנכרון ראשון' : 'Initial history import depth'}</label>
          <select value={syncDepth} onChange={(e) => setSyncDepth(e.target.value as any)} className={inputCls}>
            <option value="all">{he ? 'כל ההיסטוריה' : 'Full history'}</option>
            <option value="year">{he ? 'שנה אחרונה' : 'Last year'}</option>
            <option value="month">{he ? 'חודש אחרון' : 'Last month'}</option>
            <option value="week">{he ? 'שבוע אחרון' : 'Last week'}</option>
          </select>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-border/40">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-bold rounded-xl transition shadow-lg shadow-primary/20"
          >
            <Save className="h-4.5 w-4.5" />
            {saving ? (he ? 'שומר...' : 'Saving...') : he ? 'שמור שינויים' : 'Save changes'}
          </button>
        </div>
      </form>

      {/* MT5 live data + system status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={panelCls + ' space-y-3'}>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Download className="h-4.5 w-4.5 text-primary" />
            {he ? 'נתונים חיים מ-MT5' : 'Live MT5 data'}
          </h3>
          <dl className="grid grid-cols-2 gap-y-2.5 text-sm">
            <dt className="text-slate-500 font-semibold">{he ? 'יתרה' : 'Balance'}</dt>
            <dd className="font-bold text-end">{fmt(info?.balance)}</dd>
            <dt className="text-slate-500 font-semibold">{he ? 'הון (Equity)' : 'Equity'}</dt>
            <dd className="font-bold text-end">{fmt(info?.equity)}</dd>
            <dt className="text-slate-500 font-semibold">{he ? 'הפקדה ראשונה' : 'First deposit'}</dt>
            <dd className="font-bold text-end">{fmt(info?.firstDeposit)}</dd>
            <dt className="text-slate-500 font-semibold">{he ? 'סה"כ הפקדות' : 'Total deposits'}</dt>
            <dd className="font-bold text-end">{fmt(info?.totalDeposits)}</dd>
            <dt className="text-slate-500 font-semibold">{he ? 'סה"כ משיכות' : 'Total withdrawals'}</dt>
            <dd className="font-bold text-end">{fmt(info?.totalWithdrawals)}</dd>
            <dt className="text-slate-500 font-semibold">{he ? 'מינוף' : 'Leverage'}</dt>
            <dd className="font-bold text-end">{info?.leverage ? `1:${info.leverage}` : '—'}</dd>
            <dt className="text-slate-500 font-semibold">{he ? 'עודכן' : 'Updated'}</dt>
            <dd className="font-semibold text-end text-xs">{fmtDate(info?.updatedAt)}</dd>
          </dl>
        </div>

        <div className={panelCls + ' space-y-3'}>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Database className="h-4.5 w-4.5 text-primary" />
            {he ? 'מסד נתונים וסנכרון' : 'Database & sync'}
          </h3>
          <dl className="grid grid-cols-2 gap-y-2.5 text-sm">
            <dt className="text-slate-500 font-semibold">MongoDB</dt>
            <dd className="text-end">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${
                  health?.mongo.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${health?.mongo.connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {health?.mongo.connected ? (he ? 'מחובר' : 'Connected') : health?.mongo.state || 'offline'}
              </span>
            </dd>
            <dt className="text-slate-500 font-semibold">{he ? 'מסד' : 'Database'}</dt>
            <dd className="font-mono text-xs text-end">
              {health?.mongo.host}/{health?.mongo.database}
            </dd>
            <dt className="text-slate-500 font-semibold">{he ? 'עסקאות שמורות (חשבון)' : 'Stored trades (account)'}</dt>
            <dd className="font-bold text-end">{health?.activeAccountTrades ?? '—'}</dd>
            <dt className="text-slate-500 font-semibold">{he ? 'עסקה אחרונה' : 'Latest trade'}</dt>
            <dd className="font-semibold text-end text-xs">{fmtDate(health?.latestTradeCloseTime)}</dd>
            <dt className="text-slate-500 font-semibold">{he ? 'סנכרון אחרון' : 'Last sync'}</dt>
            <dd className="font-semibold text-end text-xs">{fmtDate(syncStatus?.lastSuccessfulSyncTime as any)}</dd>
            <dt className="text-slate-500 font-semibold">{he ? 'סטטוס' : 'Status'}</dt>
            <dd className="text-end text-xs font-bold flex items-center justify-end gap-1.5">
              <Activity className={`h-3.5 w-3.5 ${isSyncBusy ? 'text-primary animate-pulse' : 'text-slate-400'}`} />
              {isSyncBusy ? (he ? 'מסנכרן' : 'syncing') : syncStatus?.status}
            </dd>
          </dl>
          {syncStatus?.lastError && (
            <p className="text-xs text-danger font-semibold bg-danger/10 border border-danger/20 rounded-lg p-2.5">
              {syncStatus.lastError}
            </p>
          )}
          <p className="text-[11px] text-slate-400 font-semibold">
            {he
              ? 'עסקאות חדשות נשמרות אוטומטית כל דקה כל עוד MT5 פתוח. ההיסטוריה נשמרת ב-MongoDB גם אם MT5 סגור.'
              : 'New trades are saved automatically every minute while MT5 is open. History stays in MongoDB even when MT5 is closed.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccountPage;
