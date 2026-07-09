import React, { useEffect, useState } from 'react';
import { Save, Plus, X, Settings as SettingsIcon, AlertCircle, ShieldAlert } from 'lucide-react';
import api from '../services/api';
import { formatCurrency } from '../utils/format';
import { useThemeLang } from '../context/ThemeLangContext';

export const SettingsPage: React.FC = () => {
  const { t, lang } = useThemeLang();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields state
  const [defaultBalance, setDefaultBalance] = useState<number>(25000);
  const [riskPerTradePercent, setRiskPerTradePercent] = useState<number>(1.0);
  const [currency, setCurrency] = useState<string>('USD');
  const [timezone, setTimezone] = useState<string>('UTC');
  const [strategies, setStrategies] = useState<string[]>([]);
  const [newStrategy, setNewStrategy] = useState<string>('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const data = await api.getSettings();

        setDefaultBalance(data.defaultBalance);
        setRiskPerTradePercent(data.riskPerTradePercent);
        setCurrency(data.currency);
        setTimezone(data.timezone);
        setStrategies(data.strategies || []);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to fetch user configurations.');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleAddStrategy = () => {
    const trimmed = newStrategy.trim();
    if (trimmed && !strategies.includes(trimmed)) {
      setStrategies([...strategies, trimmed]);
      setNewStrategy('');
    }
  };

  const handleRemoveStrategy = (indexToRemove: number) => {
    setStrategies(strategies.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      
      await api.updateSettings({
        defaultBalance,
        riskPerTradePercent,
        currency,
        timezone,
        strategies,
      });


      alert(lang === 'he' ? 'ההגדרות נשמרו בהצלחה!' : 'Preferences saved successfully!');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update settings.');
    } finally {
      setSaving(false);
    }
  };

  const calculatedRiskVal = (defaultBalance * riskPerTradePercent) / 100;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <SettingsIcon className="h-8 w-8 text-primary animate-spin" />
        <p className="text-slate-400 text-sm font-semibold">{lang === 'he' ? 'טוען הגדרות מערכת...' : 'Loading system settings...'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in text-slate-800 dark:text-slate-100">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">{t('settings')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-1">
          {lang === 'he' 
            ? 'נהל יתרת חשבון, גודל סיכון, מטבע עבודה ורשימת אסטרטגיות.' 
            : 'Configure starting capital, risk per trade thresholds, and strategies list.'}
        </p>
      </div>

      {error && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="h-4.5 w-4.5" />
          {error}
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="glass-panel p-6 rounded-2xl space-y-6 bg-white dark:bg-card border-slate-200 dark:border-border">
          
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-200 dark:border-border pb-2.5 flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary" />
            {lang === 'he' ? 'הגדרות חשבון וסיכון' : 'Account Capital Profiles'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Starting Balance */}
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                {t('startingBalance')}
              </label>
              <input
                type="number"
                value={defaultBalance}
                onChange={(e) => setDefaultBalance(Number(e.target.value))}
                min={0}
                className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 font-semibold"
              />
            </div>

            {/* Risk size percent */}
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                {t('riskPerTrade')}
              </label>
              <input
                type="number"
                value={riskPerTradePercent}
                onChange={(e) => setRiskPerTradePercent(Number(e.target.value))}
                step={0.1}
                min={0}
                max={100}
                className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 font-semibold"
              />
            </div>

            {/* Currency Symbol */}
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                {t('currency')}
              </label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="USD, EUR, ILS"
                className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 font-semibold"
              />
            </div>

            {/* Default Broker Timezone offset */}
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                {t('timezone')}
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-sm focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200 font-semibold"
              >
                <option value="UTC">UTC (Default MT5 Naive)</option>
                <option value="GMT+2">GMT+2 (Standard Broker)</option>
                <option value="GMT+3">GMT+3 (Israel / IDT)</option>
              </select>
            </div>
          </div>

          {/* Capital Risk Calculation Helper Card */}
          <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 flex gap-3">
            <ShieldAlert className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-extrabold text-slate-900 dark:text-white block uppercase tracking-wider">
                {lang === 'he' ? 'חישוב גודל סיכון (R Size)' : 'Allocated 1R Metric Calculation'}
              </span>
              <p className="text-xs text-slate-555 mt-1 font-semibold">
                {lang === 'he' ? (
                  <span>
                    על בסיס היתרה והסיכון שהגדרת, שווי של **1R** מחושב כעת כ-{' '}
                    <span className="text-primary font-black">{formatCurrency(calculatedRiskVal, currency)}</span> (
                    {riskPerTradePercent}% מתוך {formatCurrency(defaultBalance, currency)}). כל עסקה ביומן תחשב את יחס ה-R:R שלה יחסית לסכום זה.
                  </span>
                ) : (
                  <span>
                    Based on your balance and risk thresholds, **1R** is set to{' '}
                    <span className="text-primary font-black">{formatCurrency(calculatedRiskVal, currency)}</span> (
                    {riskPerTradePercent}% of {formatCurrency(defaultBalance, currency)}). Each closed trade's R:R ratio will calculate against this value.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Strategies Setup */}
        <div className="glass-panel p-6 rounded-2xl space-y-4 bg-white dark:bg-card border-slate-200 dark:border-border">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-200 dark:border-border pb-2.5 flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary" />
            {lang === 'he' ? 'ניהול אסטרטגיות מסחר (Strategies)' : 'Strategies Setup'}
          </h3>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {strategies.map((strat, index) => (
                <span
                  key={strat}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border/60 hover:border-slate-350 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2"
                >
                  {strat}
                  <button
                    type="button"
                    onClick={() => handleRemoveStrategy(index)}
                    className="text-slate-400 hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {strategies.length === 0 && (
                <span className="text-xs text-slate-500 italic">{lang === 'he' ? 'אין אסטרטגיות מוגדרות.' : 'No strategies configured yet.'}</span>
              )}
            </div>

            <div className="flex max-w-md gap-2">
              <input
                type="text"
                placeholder="e.g. SMC OrderBlock, ICT Breaker, FVG Play"
                value={newStrategy}
                onChange={(e) => setNewStrategy(e.target.value)}
                className="flex-1 px-3.5 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-xs focus:outline-none focus:border-primary text-slate-800 dark:text-slate-200"
              />
              <button
                type="button"
                onClick={handleAddStrategy}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-850 hover:bg-slate-300 dark:hover:bg-slate-800 text-slate-800 dark:text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                {t('addStrategy')}
              </button>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-border/40">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-bold rounded-xl transition shadow-lg shadow-primary/20"
          >
            <Save className="h-4.5 w-4.5" />
            {saving ? (lang === 'he' ? 'שומר הגדרות...' : 'Saving Configurations...') : t('saveSettings')}
          </button>
        </div>
      </form>
    </div>
  );
};
export default SettingsPage;
