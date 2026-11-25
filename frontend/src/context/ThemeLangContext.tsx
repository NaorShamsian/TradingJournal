import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'he';
type Theme = 'dark' | 'light';

interface ThemeLangContextType {
  lang: Language;
  theme: Theme;
  toggleLanguage: () => void;
  toggleTheme: () => void;
  t: (key: string) => string;
}

const ThemeLangContext = createContext<ThemeLangContextType | undefined>(undefined);

// Hebrew/English translations dictionary, preserving core trading words in English
const translations: { [key in Language]: { [key: string]: string } } = {
  en: {
    dashboard: "Dashboard",
    tradesLog: "Trades Log",
    calendar: "Calendar",
    analytics: "Analytics",
    syncCenter: "Sync Center",
    account: "Account & Risk",
    payouts: "Withdrawals",
    settings: "Settings",
    netPnl: "Net P&L",
    winRate: "Win Rate",
    profitFactor: "Profit Factor",
    totalTrades: "Total Trades",
    avgWin: "Avg Win",
    avgLoss: "Avg Loss",
    avgRR: "Average R:R",
    maxDrawdown: "Max Drawdown",
    bestDay: "Best Day",
    worstDay: "Worst Day",
    thisWeek: "This Week",
    thisMonth: "This Month",
    balance: "Balance",
    refresh: "Refresh",
    refreshing: "Refreshing...",
    recentTrades: "Recent Synced Trades",
    time: "Time",
    symbol: "Symbol",
    type: "Type",
    volume: "Volume",
    entryPrice: "Entry Price",
    exitPrice: "Exit Price",
    actions: "Actions",
    noTrades: "No trades found. Go to the Sync Center to import deals from MT5.",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    cancel: "Cancel",
    strategy: "Strategy",
    session: "Session",
    emotion: "Emotion",
    mistake: "Mistake",
    notes: "Notes",
    followedRules: "Followed Rules?",
    selfRating: "Self Rating",
    beforeImage: "Before Setup",
    afterImage: "After Result",
    pasteImageHere: "Paste Chart Image (Ctrl+V) or click to browse",
    clipboardDetected: "Clipboard Image Detected",
    assignSlot: "Choose which chart screenshot slot to assign this image to:",
    setBefore: "Set as 'Before' Setup",
    setAfter: "Set as 'After' Result",
    confirmDelete: "Are you sure you want to delete this trade from your journal? This will not affect MT5 terminal data.",
    clearFilters: "Clear Filters",
    allOutcomes: "All Outcomes",
    wins: "Wins",
    losses: "Losses",
    breakeven: "Breakeven",
    searchPlaceholder: "Search comments, notes, tickers...",
    startingBalance: "Starting Balance",
    riskPerTrade: "Risk Size per Trade (%)",
    currency: "Currency Symbol",
    timezone: "Timezone",
    saveSettings: "Save All Settings",
    addStrategy: "Add Strategy",
    sessionHours: "Session Market Hours (0 - 23 UTC)",
    syncDaemonStatus: "Sync Daemon Status",
    syncNow: "Sync Now",
    syncRequested: "Sync Requested...",
    lastChecked: "Last Checked",
    lastSuccessfulSync: "Last Successful Sync",
    dealsImported: "Deals Imported (Total)",
    duplicatesSkipped: "Duplicates Skipped",
    instructionTitle: "Automatic Background Worker Setup",
    warningTitle: "MetaTrader 5 Windows System Dependency",
    setupStep1: "Install Python Packages",
    setupStep2: "Configure env variable",
    setupStep3: "Execute Auto Daemon",
    realAccountBalance: "Account Balance",
    progress: "Progress",
    riskExplanation: "1R Target Risk size = balance * risk %",
    imageSize: "Image Display Width",
    zoomImage: "Click image to open full screen",
    tradesExecutedOn: "Trades Executed on:",
    close: "Close"
  },
  he: {
    dashboard: "לוח בקרה",
    tradesLog: "יומן עסקאות",
    calendar: "לוח שנה",
    analytics: "אנליזה",
    syncCenter: "מרכז סינכרון",
    account: "חשבון וסיכון",
    payouts: "משיכות",
    settings: "הגדרות",
    netPnl: "רווח/הפסד נקי (Net P&L)",
    winRate: "אחוז הצלחה (Win Rate)",
    profitFactor: "גורם רווח (Profit Factor)",
    totalTrades: "סה\"כ עסקאות",
    avgWin: "ממוצע רווח (Avg Win)",
    avgLoss: "ממוצע הפסד (Avg Loss)",
    avgRR: "ממוצע R:R",
    maxDrawdown: "מקסימום Drawdown",
    bestDay: "היום הטוב ביותר",
    worstDay: "היום הגרוע ביותר",
    thisWeek: "השבוע",
    thisMonth: "החודש",
    balance: "יתרה",
    refresh: "רענן",
    refreshing: "מרענן...",
    recentTrades: "עסקאות אחרונות שסונכרנו",
    time: "זמן",
    symbol: "נכס (Symbol)",
    type: "סוג (Type)",
    volume: "נפח (Volume)",
    entryPrice: "מחיר כניסה",
    exitPrice: "מחיר יציאה",
    actions: "פעולות",
    noTrades: "לא נמצאו עסקאות. עבור אל מרכז הסינכרון כדי לייבא עסקאות מ-MT5.",
    save: "שמור",
    delete: "מחק",
    edit: "ערוך",
    cancel: "ביטול",
    strategy: "אסטרטגיה",
    session: "סשן (Session)",
    emotion: "רגש (Emotion)",
    mistake: "טעות (Mistake)",
    notes: "הערות (Notes)",
    followedRules: "פעלתי לפי הכללים?",
    selfRating: "ציון עצמי",
    beforeImage: "צילום לפני (Before)",
    afterImage: "צילום אחרי (After)",
    pasteImageHere: "לחץ כאן והדבק צילום גרף (Ctrl + V)",
    clipboardDetected: "זוהתה תמונה בלוח הגזירים (Clipboard)",
    assignSlot: "בחר לאיזה אזור לשייך את צילום הגרף:",
    setBefore: "הגדר כצילום 'לפני' (Before)",
    setAfter: "הגדר כצילום 'אחרי' (After)",
    confirmDelete: "האם אתה בטוח שברצונך למחוק עסקה זו מהיומן? פעולה זו לא תשפיע על נתוני הטרמינל ב-MT5.",
    clearFilters: "נקה מסננים",
    allOutcomes: "כל התוצאות",
    wins: "רווחים (Wins)",
    losses: "הפסדים (Losses)",
    breakeven: "איפוס (Breakeven)",
    searchPlaceholder: "חפש הערות, נכסים, אסטרטגיות...",
    startingBalance: "יתרת חשבון התחלתית",
    riskPerTrade: "גודל סיכון לעסקה (%)",
    currency: "סמל מטבע",
    timezone: "אזור זמן",
    saveSettings: "שמור את כל ההגדרות",
    addStrategy: "הוסף אסטרטגיה",
    sessionHours: "שעות פעילות הסשנים (0 - 23 UTC)",
    syncDaemonStatus: "סטטוס בוט הסינכרון",
    syncNow: "סנכרן כעת",
    syncRequested: "מבקש סינכרון...",
    lastChecked: "בדיקה אחרונה",
    lastSuccessfulSync: "סינכרון מוצלח אחרון",
    dealsImported: "עסקאות שיובאו (סה\"כ)",
    duplicatesSkipped: "כפילויות שדולגו",
    instructionTitle: "הוראות הפעלה לבוט סינכרון ברקע",
    warningTitle: "דרישת מערכת MetaTrader 5 (Windows)",
    setupStep1: "התקן חבילות פייתון",
    setupStep2: "הגדר קובץ סביבה (env)",
    setupStep3: "הפעל את הבוט",
    realAccountBalance: "יתרת חשבון נוכחית",
    progress: "התקדמות חשבון",
    riskExplanation: "גודל סיכון ל-1R = יתרה * אחוז סיכון",
    imageSize: "רוחב תצוגת תמונה",
    zoomImage: "לחץ על התמונה להגדלה למסך מלא",
    tradesExecutedOn: "עסקאות שבוצעו בתאריך:",
    close: "סגור"
  }
};

export const ThemeLangProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Language>(
    (localStorage.getItem('trading-journal-lang') as Language) || 'en'
  );
  const [theme, setTheme] = useState<Theme>(
    (localStorage.getItem('trading-journal-theme') as Theme) || 'dark'
  );

  useEffect(() => {
    // Update document language direction
    const dir = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    localStorage.setItem('trading-journal-lang', lang);
  }, [lang]);

  useEffect(() => {
    // Update document theme classes
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('trading-journal-theme', theme);
  }, [theme]);

  const toggleLanguage = () => {
    setLang((prev) => (prev === 'en' ? 'he' : 'en'));
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const t = (key: string): string => {
    return translations[lang][key] || key;
  };

  return (
    <ThemeLangContext.Provider value={{ lang, theme, toggleLanguage, toggleTheme, t }}>
      {children}
    </ThemeLangContext.Provider>
  );
};

export const useThemeLang = () => {
  const context = useContext(ThemeLangContext);
  if (!context) {
    throw new Error('useThemeLang must be used within a ThemeLangProvider');
  }
  return context;
};
