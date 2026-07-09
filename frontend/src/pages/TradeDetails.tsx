import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Trash2,
  Calendar,
  Clock,
  Compass,
  Smile,
  AlertTriangle,
  Image as ImageIcon,
  X,
  TrendingUp,
  Maximize2,
  Settings as SlidersIcon
} from 'lucide-react';
import api from '../services/api';
import { Trade, Settings } from '../types';
import { formatCurrency, formatDateTime, formatDuration, calculateTradeRR, formatRR } from '../utils/format';
import { useThemeLang } from '../context/ThemeLangContext';

export const TradeDetails: React.FC = () => {
  const { t, lang } = useThemeLang();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [trade, setTrade] = useState<Trade | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields state
  const [strategy, setStrategy] = useState('');
  const [session, setSession] = useState<'Asia' | 'London' | 'New York' | 'Other'>('Other');
  const [emotion, setEmotion] = useState('');
  const [mistake, setMistake] = useState(false);
  const [mistakeTags, setMistakeTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [entryReason, setEntryReason] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [followedRules, setFollowedRules] = useState(true);
  const [selfRating, setSelfRating] = useState<number>(5);
  const [screenshotBeforeUrl, setScreenshotBeforeUrl] = useState('');
  const [screenshotAfterUrl, setScreenshotAfterUrl] = useState('');
  const [screenshotBeforeScale, setScreenshotBeforeScale] = useState<number>(100);
  const [screenshotAfterScale, setScreenshotAfterScale] = useState<number>(100);

  // Local state for adding custom mistake tags
  const [newTag, setNewTag] = useState('');

  // Image clipboard paste states
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [beforeFlash, setBeforeFlash] = useState(false);
  const [afterFlash, setAfterFlash] = useState(false);

  // Sizing adjust modal states
  const [showResizeModal, setShowResizeModal] = useState<'before' | 'after' | null>(null);
  const [tempScale, setTempScale] = useState<number>(100);

  // Lightbox Zoom state
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(100);

  // Smart Position Aggregation exits
  const [relatedExits, setRelatedExits] = useState<Trade[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);

        const [tradeRes, settingsRes] = await Promise.all([
          api.getTradeById(id),
          api.getSettings(),
        ]);

        setTrade(tradeRes);
        setSettings(settingsRes);

        // Populate fields
        setStrategy(tradeRes.strategy || 'Unassigned');
        setSession(tradeRes.session || 'Other');
        setEmotion(tradeRes.emotion || '');
        setMistake(tradeRes.mistake || false);
        setMistakeTags(tradeRes.mistakeTags || []);
        setNotes(tradeRes.notes || '');
        setEntryReason(tradeRes.entryReason || '');
        setExitReason(tradeRes.exitReason || '');
        setFollowedRules(tradeRes.followedRules !== false);
        setSelfRating(tradeRes.selfRating || 5);
        setScreenshotBeforeUrl(tradeRes.screenshotBeforeUrl || '');
        setScreenshotAfterUrl(tradeRes.screenshotAfterUrl || '');
        setScreenshotBeforeScale((tradeRes as any).screenshotBeforeScale || 100);
        setScreenshotAfterScale((tradeRes as any).screenshotAfterScale || 100);

        // Smart aggregation check (fetch exits sharing the same position ID)
        if (tradeRes.positionId) {
          try {
            const relRes = await api.getTrades({ symbol: tradeRes.symbol, limit: 100 });
            const filtered = relRes.trades.filter((t: Trade) => t.positionId === tradeRes.positionId);
            setRelatedExits(filtered);
          } catch (e) {
            console.error('Error fetching related exits:', e);
          }
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Error loading trade details.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                setPastedImage(event.target.result as string);
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      setSaving(true);
      const updated = await api.updateTrade(id, {
        strategy,
        session,
        emotion,
        mistake,
        mistakeTags,
        notes,
        entryReason,
        exitReason,
        followedRules,
        selfRating,
        screenshotBeforeUrl,
        screenshotAfterUrl,
        screenshotBeforeScale,
        screenshotAfterScale,
      } as any);
      setTrade(updated);
      alert(lang === 'he' ? 'פרטי העסקה נשמרו בהצלחה!' : 'Journal entry saved successfully!');
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm(lang === 'he' ? 'האם אתה בטוח שברצונך למחוק עסקה זו?' : 'Are you sure you want to delete this trade?')) return;
    try {
      await api.deleteTrade(id);
      navigate('/trades');
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const addMistakeTag = () => {
    if (newTag.trim() && !mistakeTags.includes(newTag.trim())) {
      setMistakeTags([...mistakeTags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeMistakeTag = (tagToRemove: string) => {
    setMistakeTags(mistakeTags.filter(tag => tag !== tagToRemove));
  };

  const openResizeModal = (slot: 'before' | 'after') => {
    setShowResizeModal(slot);
    setTempScale(slot === 'before' ? screenshotBeforeScale : screenshotAfterScale);
  };

  const saveResizeScale = () => {
    if (showResizeModal === 'before') {
      setScreenshotBeforeScale(tempScale);
    } else {
      setScreenshotAfterScale(tempScale);
    }
    setShowResizeModal(null);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Clock className="h-8 w-8 text-primary animate-spin" />
        <p className="text-slate-400 text-sm font-semibold">{lang === 'he' ? 'טוען את נתוני העסקה...' : 'Loading trade details...'}</p>
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="glass-panel p-8 rounded-2xl max-w-md mx-auto text-center border-danger/30 mt-10">
        <AlertTriangle className="h-10 w-10 text-danger mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Trade Not Found</h3>
        <p className="text-slate-500 dark:text-slate-400 text-xs mb-6">{error || 'Requested trade is not in database.'}</p>
        <Link to="/trades" className="text-xs font-bold text-primary hover:underline flex items-center justify-center gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          {lang === 'he' ? 'חזור לספר העסקאות' : 'Back to Trades Log'}
        </Link>
      </div>
    );
  }

  const currency = settings?.currency || 'USD';
  const isWin = trade.netProfit >= 0;
  
  // Dynamic R:R calculation based on capital risk parameters
  const startingBalance = settings?.defaultBalance || 25000;
  const riskPercent = settings?.riskPerTradePercent || 1.0;
  const calculatedRR = calculateTradeRR(trade.netProfit, startingBalance, riskPercent);

  // Position aggregation totals
  const totalPositionVolume = relatedExits.reduce((sum, e) => sum + e.volume, 0);
  const totalPositionNetProfit = relatedExits.reduce((sum, e) => sum + e.netProfit, 0);

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-slate-100">
      
      {/* Navigation and Actions Row */}
      <div className="flex items-center justify-between">
        <Link
          to="/trades"
          className="flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white text-sm font-bold transition"
        >
          <ArrowLeft className="h-4 w-4" />
          {lang === 'he' ? 'חזור לספר העסקאות' : 'Back to Trades Log'}
        </Link>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-danger/10 border border-danger/20 hover:bg-danger/20 text-danger text-xs font-bold rounded-xl transition"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {lang === 'he' ? 'מחק עסקה' : 'Delete Trade'}
        </button>
      </div>

      {/* Trade Quick Metrics Banner */}
      <div className={`p-6 rounded-2xl border-l-4 ${
        isWin 
          ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border-l-emerald-500 border border-slate-200 dark:border-border' 
          : 'bg-rose-50/50 dark:bg-rose-950/10 border-l-rose-500 border border-slate-200 dark:border-border'
      } flex flex-col md:flex-row md:items-center justify-between gap-6`}>
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{trade.symbol}</span>
            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black border ${
              trade.type === 'BUY' 
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-505' 
                : 'bg-orange-500/10 border-orange-500/30 text-orange-505'
            }`}>
              {trade.type}
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-350 font-mono font-bold">{trade.volume.toFixed(2)} Lots</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-550 dark:text-slate-400">
            <span className="flex items-center gap-1 font-semibold">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateTime(trade.closeTime)}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 font-semibold">
              <Clock className="h-3.5 w-3.5" />
              {lang === 'he' ? 'משך עסקה:' : 'Duration:'} {formatDuration(trade.durationMinutes)}
            </span>
          </div>
        </div>

        <div className="text-left md:text-right">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">{lang === 'he' ? 'רווח/הפסד נקי' : 'Net P&L Result'}</p>
          <h2 className={`text-2xl md:text-3xl font-black ${isWin ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isWin ? '+' : ''}{formatCurrency(trade.netProfit, currency)}
          </h2>
          <div className="flex items-center md:justify-end gap-2 text-xs mt-1">
            <span className="text-slate-450 font-bold">MT5 Position ID:</span>
            <span className="font-mono text-slate-600 dark:text-slate-300">{trade.positionId}</span>
          </div>
        </div>
      </div>

      {/* Smart Position Aggregation Display */}
      {relatedExits.length > 1 && (
        <div className="p-5 rounded-2xl bg-white dark:bg-card border border-slate-200 dark:border-border/60 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-border/30 pb-2.5">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-4.5 w-4.5 text-primary" />
              {lang === 'he' ? 'איחוד פוזיציה חכם (Smart Position Grouping)' : 'Smart Position Aggregation'}
            </h3>
            <span className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full">
              {relatedExits.length} {lang === 'he' ? 'יציאות חלקיות' : 'Exits'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-bold text-slate-500">
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-border/40">
              <span className="block text-[10px] text-slate-400 uppercase tracking-wider">{lang === 'he' ? 'סך נפח עסקה' : 'Total Position Lots'}</span>
              <span className="text-sm font-black text-slate-800 dark:text-white font-mono block mt-1">{totalPositionVolume.toFixed(2)} lots</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-border/40">
              <span className="block text-[10px] text-slate-400 uppercase tracking-wider">{lang === 'he' ? 'סך רווח מצטבר' : 'Total Position PnL'}</span>
              <span className={`text-sm font-black block mt-1 ${totalPositionNetProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {totalPositionNetProfit >= 0 ? '+' : ''}{formatCurrency(totalPositionNetProfit, currency)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-border/40">
              <span className="block text-[10px] text-slate-400 uppercase tracking-wider">{lang === 'he' ? 'סך רווח יחסי' : 'Total Position R:R'}</span>
              <span className={`text-sm font-black block mt-1 ${totalPositionNetProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {formatRR(calculateTradeRR(totalPositionNetProfit, startingBalance, riskPercent))}
              </span>
            </div>
          </div>

          {/* Partial close exit timeline */}
          <div className="space-y-2.5 pt-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">{lang === 'he' ? 'פירוט סגירות חלקיות' : 'Exits Timeline Breakdown'}</span>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {relatedExits.map((exit, index) => {
                const isCurrent = exit._id === id;
                return (
                  <div 
                    key={exit._id} 
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs transition duration-200 ${
                      isCurrent 
                        ? 'bg-primary/5 border-primary shadow-sm' 
                        : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-border/40 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-black flex items-center justify-center text-slate-600 dark:text-slate-400">
                        {index + 1}
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-800 dark:text-white">{exit.volume.toFixed(2)} Lot close</span>
                        <span className="text-[10px] text-slate-400 ml-2 mr-2">at {exit.exitPrice.toFixed(5)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 font-bold">
                      <span className={exit.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                        {exit.netProfit >= 0 ? '+' : ''}{formatCurrency(exit.netProfit, currency)}
                      </span>
                      {!isCurrent && (
                        <Link 
                          to={`/trades/${exit._id}`}
                          className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] transition"
                        >
                          {lang === 'he' ? 'צפה' : 'Inspect'}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Grid: Left Column MT5 Execution details, Right Column Journal Input Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Tech Details */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-border h-fit space-y-6 bg-white dark:bg-card">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-border pb-2.5 uppercase tracking-wider">
            MT5 Terminal Stats
          </h3>
          
          <div className="space-y-4 text-xs font-semibold text-slate-650 dark:text-slate-350">
            <div className="flex justify-between">
              <span className="text-slate-400">{t('entryPrice')}</span>
              <span className="font-mono text-slate-900 dark:text-white font-extrabold">{trade.entryPrice.toFixed(5)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{t('exitPrice')}</span>
              <span className="font-mono text-slate-900 dark:text-white font-extrabold">{trade.exitPrice.toFixed(5)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 dark:border-border/30 pt-2.5">
              <span className="text-slate-400">Stop Loss (SL)</span>
              <span className="font-mono text-slate-750 dark:text-slate-300">{trade.stopLoss ? trade.stopLoss.toFixed(5) : 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Take Profit (TP)</span>
              <span className="font-mono text-slate-755 dark:text-slate-300">{trade.takeProfit ? trade.takeProfit.toFixed(5) : 'None'}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 dark:border-border/30 pt-2.5">
              <span className="text-slate-400">{lang === 'he' ? 'רווח גולמי' : 'Gross Profit'}</span>
              <span className={`font-mono font-extrabold ${trade.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {formatCurrency(trade.profit, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Commission</span>
              <span className="font-mono text-slate-700 dark:text-slate-305">{formatCurrency(trade.commission, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Swap</span>
              <span className="font-mono text-slate-700 dark:text-slate-305">{formatCurrency(trade.swap, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 dark:border-border/30 pt-2.5">
              <span className="text-slate-400">{lang === 'he' ? 'רווח יחסי (R:R)' : 'Calculated R:R'}</span>
              <span className={`font-mono font-black ${calculatedRR >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {formatRR(calculatedRR)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Journaling Fields Editor */}
        <form onSubmit={handleSave} className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-border space-y-6 bg-white dark:bg-card">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white border-b border-slate-200 dark:border-border pb-3 flex items-center gap-2">
              <Compass className="h-5 w-5 text-primary" />
              {lang === 'he' ? 'סקירת עסקה ויומן' : 'Journal Review Workshop'}
            </h3>

            {/* Grid fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Strategy Dropdown */}
              <div>
                <label className="text-xs font-bold text-slate-550 dark:text-slate-400 block mb-1.5">
                  {t('strategy')}
                </label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 font-semibold"
                >
                  <option value="Unassigned">Unassigned</option>
                  {settings?.strategies.map(strat => (
                    <option key={strat} value={strat}>{strat}</option>
                  ))}
                </select>
              </div>

              {/* Session Dropdown */}
              <div>
                <label className="text-xs font-bold text-slate-550 dark:text-slate-400 block mb-1.5">
                  {t('session')}
                </label>
                <select
                  value={session}
                  onChange={(e) => setSession(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 font-semibold"
                >
                  <option value="Asia">Asia</option>
                  <option value="London">London</option>
                  <option value="New York">New York</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Emotion */}
              <div>
                <label className="text-xs font-bold text-slate-555 dark:text-slate-400 block mb-1.5">
                  {t('emotion')}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={emotion}
                    onChange={(e) => setEmotion(e.target.value)}
                    placeholder="e.g. Calm, FOMO, Greedy, Anxious"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 placeholder-slate-500"
                  />
                  <Smile className={`absolute ${lang === 'he' ? 'right-3.5' : 'left-3.5'} top-3.5 h-4.5 w-4.5 text-slate-500`} />
                </div>
              </div>

              {/* Self Rating */}
              <div>
                <label className="text-xs font-bold text-slate-550 dark:text-slate-400 block mb-1.5">
                  {t('selfRating')} (1 - 10)
                </label>
                <select
                  value={selfRating}
                  onChange={(e) => setSelfRating(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 font-semibold"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rating => (
                    <option key={rating} value={rating}>{rating} / 10</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Checkboxes Row */}
            <div className="flex flex-col md:flex-row md:items-center gap-6 p-4 bg-slate-100 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-border/50">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={followedRules}
                  onChange={(e) => setFollowedRules(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-slate-300 dark:border-border bg-slate-100 dark:bg-slate-900 text-primary focus:ring-0 focus:ring-offset-0"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">{t('followedRules')}</span>
                  <span className="text-[10px] text-slate-500">{lang === 'he' ? 'פעלתי בדיוק לפי תוכנית המסחר שלי' : 'I strictly followed my trading plan guidelines'}</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer select-none border-t md:border-t-0 md:border-l border-slate-200 dark:border-border/50 pt-3.5 md:pt-0 md:pl-6 md:pr-6">
                <input
                  type="checkbox"
                  checked={mistake}
                  onChange={(e) => setMistake(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-slate-300 dark:border-border bg-slate-100 dark:bg-slate-900 text-danger focus:ring-0 focus:ring-offset-0"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">{lang === 'he' ? 'עסקה זו היא טעות?' : 'Is this a Mistake?'}</span>
                  <span className="text-[10px] text-slate-500">{lang === 'he' ? 'סמן עסקה זו כטעות משמעת/ביצוע' : 'Identify this trade as a bad behavior / execution mistake'}</span>
                </div>
              </label>
            </div>

            {/* Mistake Tags selection */}
            {mistake && (
              <div className="space-y-2 p-4 bg-danger/5 rounded-xl border border-danger/10">
                <label className="text-xs font-bold text-danger block">
                  {lang === 'he' ? 'תגיות טעויות' : 'Mistake Tags'}
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {mistakeTags.map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-danger/20 text-danger font-bold rounded-md text-[10px] flex items-center gap-1.5"
                    >
                      {tag}
                      <button type="button" onClick={() => removeMistakeTag(tag)} className="hover:text-slate-955 dark:hover:text-white">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {mistakeTags.length === 0 && (
                    <span className="text-xs text-slate-400">{lang === 'he' ? 'אין תגיות שנוספו.' : 'No mistake tags assigned yet.'}</span>
                  )}
                </div>
                
                <div className="flex max-w-sm gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="e.g. FOMO, Chased, Oversized"
                    className="flex-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-lg text-xs focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={addMistakeTag}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-850 border border-slate-300 dark:border-border hover:bg-slate-350 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-bold rounded-lg"
                  >
                    {lang === 'he' ? 'הוסף' : 'Add'}
                  </button>
                </div>
              </div>
            )}

            {/* Textarea fields */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                  {lang === 'he' ? 'מדוע נכנסתי לעסקה (SMC / Rationale / Setup)' : 'Why I Entered (Setup / Rationale)'}
                </label>
                <textarea
                  value={entryReason}
                  onChange={(e) => setEntryReason(e.target.value)}
                  rows={2}
                  placeholder={lang === 'he' ? 'תאר את הטריגר המבני שלך לכניסה לעסקה...' : 'Describe your structural entry triggers...'}
                  className="w-full px-3.5 py-2.5 bg-slate-105 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 placeholder-slate-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                  {lang === 'he' ? 'מדוע יצאתי מהעסקה (TP / SL / Invalidation)' : 'Why I Exited (Target Hit / Invalidation)'}
                </label>
                <textarea
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value)}
                  rows={2}
                  placeholder={lang === 'he' ? 'תאר מדוע העסקה נסגרה...' : 'Describe how or why the trade was closed...'}
                  className="w-full px-3.5 py-2.5 bg-slate-105 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 placeholder-slate-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                  {lang === 'he' ? 'הערות נוספות וסיכום פסיכולוגי' : 'Post-Trade Notes & Review'}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={lang === 'he' ? 'לקחים שנלמדו מהעסקה, ניתוח פסיכולוגי או התנהגות שוק...' : 'Lessons learned, details of price action, or psychology review...'}
                  className="w-full px-3.5 py-2.5 bg-slate-105 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 placeholder-slate-500"
                />
              </div>
            </div>

            {/* Screenshots section */}
            <div className="space-y-4 border-t border-slate-200 dark:border-border pt-4">
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4 text-slate-400" />
                {lang === 'he' ? 'תצלומי מסך של הגרף' : 'Journal Screenshots (URLs)'}
              </h4>

              {/* Glowing blinking dropzone/pastezone */}
              <div 
                className="border-2 border-dashed border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 py-6 px-4 rounded-2xl text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-2 group animate-pulse hover:animate-none"
                onClick={() => {
                  alert(lang === 'he' 
                    ? "העתק צילום גרף למחשב (Ctrl + C), חזור לכאן ולחץ Ctrl + V על הדף להדבקה מיידית!" 
                    : "Copy any image to your clipboard (Ctrl+C), then click here on the page and press Ctrl+V to paste!"
                  );
                }}
              >
                <div className="p-3 bg-primary/20 text-primary rounded-full group-hover:scale-105 transition duration-300">
                  <ImageIcon className="h-6 w-6" />
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {t('pasteImageHere')}
                </span>
                <span className="text-[10px] text-slate-400">
                  {lang === 'he' ? "תומך בהדבקה ישירה של צילומי מסך שהעתקת עם Ctrl+C" : "Supports direct pasting from clipboard"}
                </span>
              </div>

              {/* Manual URL entry fallback */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block mb-1">
                    {lang === 'he' ? 'קישור תמונת כניסה (Before)' : 'Entry Setup (Before Screenshot)'}
                  </label>
                  <input
                    type="url"
                    value={screenshotBeforeUrl}
                    onChange={(e) => setScreenshotBeforeUrl(e.target.value)}
                    placeholder="https://imgur.com/your-chart.png"
                    className="w-full px-3.5 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-lg text-xs focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block mb-1">
                    {lang === 'he' ? 'קישור תמונת יציאה (After)' : 'Exit Result (After Screenshot)'}
                  </label>
                  <input
                    type="url"
                    value={screenshotAfterUrl}
                    onChange={(e) => setScreenshotAfterUrl(e.target.value)}
                    placeholder="https://imgur.com/your-chart-close.png"
                    className="w-full px-3.5 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-lg text-xs focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              {/* Rendering Screenshots preview if present */}
              {(screenshotBeforeUrl || screenshotAfterUrl) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-border/30">
                  
                  {screenshotBeforeUrl && (
                    <div className={`glass-panel p-3 rounded-xl border border-slate-200 dark:border-border transition-all duration-300 relative group bg-white dark:bg-card ${beforeFlash ? 'animate-paste-flash' : ''}`}>
                      <div className="absolute top-3 right-3 flex gap-1.5 z-10 opacity-60 group-hover:opacity-100 transition duration-200">
                        <button
                          type="button"
                          onClick={() => openResizeModal('before')}
                          className="p-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-border/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition shadow-md"
                          title="Resize Layout Display"
                        >
                          <SlidersIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setScreenshotBeforeUrl(''); }}
                          className="p-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition shadow-md"
                          title="Delete Image"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="text-[10px] text-slate-400 mb-1.5 font-bold uppercase tracking-wider">{t('beforeImage')}</div>
                      
                      <div className="flex justify-center bg-slate-50 dark:bg-slate-950/20 p-1.5 rounded-lg border border-slate-100 dark:border-border/30">
                        <img
                          src={screenshotBeforeUrl}
                          alt="Before Entry Setup"
                          onClick={() => { setZoomImage(screenshotBeforeUrl); setZoomScale(100); }}
                          style={{ width: `${screenshotBeforeScale}%`, maxWidth: '100%' }}
                          className="rounded-lg object-contain cursor-pointer hover:opacity-90 transition max-h-[350px]"
                        />
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1.5 text-center font-bold flex items-center justify-center gap-1">
                        <Maximize2 className="h-3 w-3" />
                        {t('zoomImage')} ({screenshotBeforeScale}%)
                      </div>
                    </div>
                  )}

                  {screenshotAfterUrl && (
                    <div className={`glass-panel p-3 rounded-xl border border-slate-200 dark:border-border transition-all duration-300 relative group bg-white dark:bg-card ${afterFlash ? 'animate-paste-flash' : ''}`}>
                      <div className="absolute top-3 right-3 flex gap-1.5 z-10 opacity-60 group-hover:opacity-100 transition duration-200">
                        <button
                          type="button"
                          onClick={() => openResizeModal('after')}
                          className="p-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-border/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition shadow-md"
                          title="Resize Layout Display"
                        >
                          <SlidersIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setScreenshotAfterUrl(''); }}
                          className="p-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition shadow-md"
                          title="Delete Image"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="text-[10px] text-slate-400 mb-1.5 font-bold uppercase tracking-wider">{t('afterImage')}</div>
                      
                      <div className="flex justify-center bg-slate-50 dark:bg-slate-950/20 p-1.5 rounded-lg border border-slate-100 dark:border-border/30">
                        <img
                          src={screenshotAfterUrl}
                          alt="After Result"
                          onClick={() => { setZoomImage(screenshotAfterUrl); setZoomScale(100); }}
                          style={{ width: `${screenshotAfterScale}%`, maxWidth: '100%' }}
                          className="rounded-lg object-contain cursor-pointer hover:opacity-90 transition max-h-[350px]"
                        />
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1.5 text-center font-bold flex items-center justify-center gap-1">
                        <Maximize2 className="h-3 w-3" />
                        {t('zoomImage')} ({screenshotAfterScale}%)
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Save Buttons */}
            <div className="border-t border-slate-200 dark:border-border pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-bold rounded-xl transition shadow-lg shadow-primary/20"
              >
                <Save className="h-4.5 w-4.5" />
                {saving ? (lang === 'he' ? 'שומר...' : 'Saving...') : t('save')}
              </button>
            </div>

          </div>
        </form>

      </div>

      {/* Clipboard Image Paste Modal Overlay */}
      {pastedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setPastedImage(null)}
        >
          <div 
            className="glass-panel p-6 rounded-2xl border border-border/80 space-y-4 max-w-md w-full shadow-2xl bg-white dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm md:text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">{t('clipboardDetected')}</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs">{t('assignSlot')}</p>
            
            <div className="border border-border/40 rounded-xl overflow-hidden max-h-40 bg-slate-105 dark:bg-slate-95">
              <img src={pastedImage} alt="Pasted clipboard preview" className="w-full h-full object-contain" />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setScreenshotBeforeUrl(pastedImage);
                  setPastedImage(null);
                  setBeforeFlash(true);
                  setTimeout(() => setBeforeFlash(false), 1500);
                }}
                className="py-2.5 px-3 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-primary/20"
              >
                {t('setBefore')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setScreenshotAfterUrl(pastedImage);
                  setPastedImage(null);
                  setAfterFlash(true);
                  setTimeout(() => setAfterFlash(false), 1500);
                }}
                className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition"
              >
                {t('setAfter')}
              </button>
            </div>
            
            <button
              type="button"
              onClick={() => setPastedImage(null)}
              className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Graphical Screenshot Sizing Modal Popup */}
      {showResizeModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowResizeModal(null)}
        >
          <div 
            className="glass-panel p-6 rounded-2xl border border-border/80 space-y-4 max-w-lg w-full shadow-2xl bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-border pb-2.5">
              <h3 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
                <SlidersIcon className="h-4.5 w-4.5 text-primary" />
                {lang === 'he' ? 'כוונן מימדי תצוגה' : 'Adjust Display Scale'}
              </h3>
              <button onClick={() => setShowResizeModal(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'he' 
                ? 'גרור את הסליידר לקביעת רוחב התמונה ביומן. המימדים יישמרו במסד הנתונים בעת שמירת העסקה.' 
                : 'Drag the slider below to resize how wide this chart appears in your journal page.'}
            </p>

            {/* Slider control */}
            <div className="space-y-2 py-2">
              <div className="flex justify-between text-xs font-black text-primary">
                <span>{tempScale}% width</span>
                <span>{tempScale === 100 ? 'Full Size' : 'Scaled'}</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                value={tempScale}
                onChange={(e) => setTempScale(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Presets */}
            <div className="flex justify-center gap-2 text-[10px] font-bold">
              {[30, 50, 75, 100].map(pct => (
                <button
                  type="button"
                  key={pct}
                  onClick={() => setTempScale(pct)}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    tempScale === pct 
                      ? 'bg-primary text-white border-primary shadow-sm' 
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-border/60 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {pct}% width
                </button>
              ))}
            </div>

            {/* Live Preview Container inside sizing modal */}
            <div className="border border-slate-200 dark:border-border/50 rounded-xl bg-slate-50 dark:bg-slate-950/40 p-3 max-h-56 overflow-auto flex items-center justify-center">
              <img 
                src={showResizeModal === 'before' ? screenshotBeforeUrl : screenshotAfterUrl} 
                alt="Live resize preview" 
                style={{ width: `${tempScale}%` }}
                className="rounded-lg object-contain transition-all duration-150"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-200 dark:border-border/40">
              <button
                type="button"
                onClick={() => setShowResizeModal(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={saveResizeScale}
                className="px-5 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition shadow-lg shadow-primary/10"
              >
                {lang === 'he' ? 'אשר מימד תצוגה' : 'Confirm Size'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <span className="text-xs font-bold text-slate-400">{t('imageSize')}:</span>
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
export default TradeDetails;
