import React, { useEffect, useState } from 'react';
import { RefreshCw, Play, CheckCircle2, ShieldAlert, Terminal, FileCode, Check } from 'lucide-react';
import api from '../services/api';
import { SyncStatus } from '../types';
import { formatDate } from '../utils/format';
import { useThemeLang } from '../context/ThemeLangContext';

export const SyncCenter: React.FC = () => {
  const { t, lang } = useThemeLang();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await api.getSyncStatus();
      setStatus(data);
    } catch (err) {
      console.error('Error fetching sync status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // poll status every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleSyncNow = async () => {
    try {
      setTriggering(true);
      await api.triggerSync();
      // Wait slightly and fetch
      setTimeout(async () => {
        await fetchStatus();
        setTriggering(false);
      }, 1500);
    } catch (err: any) {
      alert(`Sync trigger failed: ${err.message}`);
      setTriggering(false);
    }
  };

  const handleResetDatabase = async () => {
    const confirmMsg = lang === 'he' 
      ? 'אזהרה חמורה! פעולה זו תמחק את כל העסקאות השמורות במסד הנתונים ותאפס לחלוטין את היסטוריית הסינכרון. האם ברצונך להמשיך?'
      : 'WARNING! This will permanently delete all trades and reset sync progress. Do you wish to proceed?';
      
    if (!window.confirm(confirmMsg)) return;

    try {
      setResetting(true);
      await api.resetDatabase();
      alert(lang === 'he' 
        ? 'מסד הנתונים אופס בהצלחה! כעת עליך למחוק את הקובץ sync_state.json מתיקיית sync במחשב שלך ולהפעיל מחדש את הסקריפט mt5_sync_worker.py כדי להתחיל סינכרון היסטורי נקי.' 
        : 'Database reset successfully! Please delete sync_state.json in your sync/ folder and restart mt5_sync_worker.py to trigger a clean historical sync.');
      window.location.reload();
    } catch (err: any) {
      alert(`Reset failed: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
        <p className="text-slate-400 text-sm font-semibold">{lang === 'he' ? 'בודק סטטוס חיבור עם MT5...' : 'Establishing broker network connection...'}</p>
      </div>
    );
  }

  const isTriggerActive = status?.triggerManualSync;
  
  const setupInstructions = [
    {
      title: t('setupStep1'),
      code: "pip install MetaTrader5 requests python-dotenv pandas numpy",
      desc: lang === 'he' ? "התקן את ספריות הפייתון והמודולים הנדרשים לחיבור לטרמינל." : "Install MetaTrader5 and other dependent network modules."
    },
    {
      title: t('setupStep2'),
      code: `API_BASE_URL=http://localhost:5000/api\nSYNC_INTERVAL_SECONDS=60`,
      desc: lang === 'he' ? "צור קובץ `.env` בתיקייה `sync` המגדיר את נתיב השרת." : "Configure target local server REST endpoints inside `sync/.env`."
    },
    {
      title: t('setupStep3'),
      code: "python mt5_sync_worker.py",
      desc: lang === 'he' ? "הפעל את בוט הסינכרון ברקע (עליך להשאיר את חלון ה-MT5 פתוח במקביל)." : "Execute daemon worker. Ensure MetaTrader 5 app remains open and logged in."
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-slate-100">
      
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">{t('syncCenter')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-1">
            {lang === 'he' 
              ? 'נהל וסנכרן את עסקאות ה-MetaTrader 5 שלך באופן ידני או אוטומטי.' 
              : 'Synchronize closed deals from MetaTrader 5 with your cloud trade database.'}
          </p>
        </div>
      </div>

      {/* Grid: Status Panel and Action Triggers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Status panel */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl space-y-6 bg-white dark:bg-card border-slate-200 dark:border-border">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-200 dark:border-border pb-2.5 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            {t('syncDaemonStatus')}
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-border/60">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">{t('lastChecked')}</span>
              <span className="text-xs font-mono font-bold block mt-1">
                {status?.updatedAt ? formatDate(status.updatedAt) : 'Never'}
              </span>
            </div>
            
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-border/60">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">{t('lastSuccessfulSync')}</span>
              <span className="text-xs font-mono font-bold block mt-1">
                {status?.lastSyncTime ? formatDate(status.lastSyncTime) : 'Never'}
              </span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-border/60 col-span-2 md:col-span-1">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">{lang === 'he' ? 'מצב חיבור רקע' : 'Background Daemon Connection'}</span>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs font-bold text-success">
                  {lang === 'he' ? 'פעיל וממתין' : 'Waiting polling'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-200 dark:border-border/40 pt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <div>
              <span>{t('dealsImported')}:</span>
              <span className="font-extrabold text-slate-900 dark:text-white ml-2 mr-2">{status?.importedCount || 0}</span>
            </div>
            <div>
              <span>{t('duplicatesSkipped')}:</span>
              <span className="font-extrabold text-slate-900 dark:text-white ml-2 mr-2">{status?.skippedDuplicates || 0}</span>
            </div>
          </div>
        </div>

        {/* Sync Actions Card Panel */}
        <div className="flex flex-col gap-6">
          {/* Sync trigger button card */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between bg-white dark:bg-card border-slate-200 dark:border-border flex-1">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider block">{lang === 'he' ? 'סינכרון ידני מהיר' : 'Instant Manual Import'}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-semibold">
                {lang === 'he' 
                  ? 'שלח דרישת סינכרון מיידית לבוט. הבוט יבצע סריקה מיידית של היסטוריית הטרמינל ויוריד את העסקאות האחרונות.' 
                  : 'Send instant query request down to background sync daemon. The bot will scan MT5 terminal history and append new deals.'}
              </p>
            </div>

            <button
              onClick={handleSyncNow}
              disabled={triggering || isTriggerActive}
              className="w-full mt-6 py-3.5 bg-primary hover:bg-primary-dark text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              <Play className={`h-4 w-4 ${triggering || isTriggerActive ? 'animate-spin' : ''}`} />
              {triggering || isTriggerActive ? t('syncRequested') : t('syncNow')}
            </button>
          </div>

          {/* Reset Database Card */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between bg-white dark:bg-card border-danger/20 dark:border-danger/30 flex-1">
            <div>
              <h3 className="text-sm font-bold text-danger uppercase tracking-wider block">{lang === 'he' ? 'איפוס יומן עסקאות' : 'Reset Trade Ledger'}</h3>
              <p className="text-xs text-slate-550 dark:text-slate-400 mt-1 font-semibold">
                {lang === 'he'
                  ? 'מחיקת כל העסקאות במסד הנתונים לצמיתות ואיפוס סטטוס הסנכרון כדי להתחיל סנכרון נקי מחדש.'
                  : 'Permanently deletes all trade records from MongoDB Atlas and clears the sync tracker progress state.'}
              </p>
            </div>

            <button
              onClick={handleResetDatabase}
              disabled={resetting}
              className="w-full mt-6 py-3.5 bg-danger/10 border border-danger/20 hover:bg-danger/25 text-danger text-xs font-black rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ShieldAlert className="h-4.5 w-4.5" />
              {resetting ? (lang === 'he' ? 'מאפס...' : 'Resetting...') : (lang === 'he' ? 'אפס יומן עסקאות' : 'Reset Database')}
            </button>
          </div>
        </div>

      </div>

      {/* Setup Instructions Panel */}
      <div className="glass-panel p-6 rounded-2xl space-y-4 bg-white dark:bg-card border-slate-200 dark:border-border">
        
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-border pb-3">
          <Terminal className="h-5 w-5 text-primary" />
          {t('instructionTitle')}
        </h3>

        {/* Windows OS Warning Banner */}
        <div className="p-4 bg-orange-500/10 border border-orange-500/20 text-orange-500 dark:text-orange-400 rounded-xl text-xs flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-extrabold block text-sm mb-1">{lang === 'he' ? 'שימוש ב-Windows בלבד' : 'Windows Environment Requirement'}</span>
            <p className="leading-relaxed">
              {lang === 'he' 
                ? 'חבילת MetaTrader 5 של פייתון תואמת רק למערכות הפעלה מסוג Windows. ודא כי הטרמינל של MT5 מותקן, פתוח ומחובר לחשבון המסחר שלך באותו המחשב שבו רצה האפליקציה.'
                : 'The MT5 Python integration library strictly runs on Windows OS. Ensure your MT5 desktop client is open and connected.'}
            </p>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          {setupInstructions.map((step, idx) => (
            <div key={idx} className="flex flex-col md:flex-row gap-4 p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-border/50 rounded-xl">
              <div className="flex-1 space-y-1">
                <span className="text-[10px] text-primary font-black uppercase tracking-widest block">{lang === 'he' ? `שלב ${idx + 1}` : `STEP ${idx + 1}`}</span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white block">{step.title}</span>
                <p className="text-xs text-slate-500">{step.desc}</p>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                <div className="relative group bg-slate-900 text-slate-100 p-3.5 rounded-lg border border-slate-950 font-mono text-xs flex items-center justify-between">
                  <span className="block pr-8 select-all whitespace-pre-wrap">{step.code}</span>
                  <button
                    onClick={() => copyToClipboard(step.code, idx)}
                    className="absolute right-2 top-2 p-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 rounded transition opacity-60 group-hover:opacity-100"
                    title="Copy command code"
                  >
                    {copiedIndex === idx ? <Check className="h-3.5 w-3.5 text-success" /> : <FileCode className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default SyncCenter;
