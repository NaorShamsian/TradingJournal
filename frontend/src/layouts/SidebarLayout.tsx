import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  Calendar,
  LineChart,
  RefreshCw,
  Settings as SettingsIcon,
  Menu,
  X,
  Sun,
  Moon,
  Plus,
  ChevronDown,
  Wallet
} from 'lucide-react';
import { useThemeLang } from '../context/ThemeLangContext';
import { api } from '../services/api';
import { calculateTradeRR } from '../utils/format';

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children }) => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { lang, theme, toggleLanguage, toggleTheme, t } = useThemeLang();
  
  const [globalRR, setGlobalRR] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  // Modals & Selectors State
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Account Form State
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [defaultBalance, setDefaultBalance] = useState('25000');
  const [riskPercent, setRiskPercent] = useState('1.0');
  const [syncHistoryDepth, setSyncHistoryDepth] = useState('all');
  const [creatingAccount, setCreatingAccount] = useState(false);

  const fetchGlobalData = async () => {
    try {
      const [statsRes, settingsRes, syncRes, accountsRes] = await Promise.all([
        api.getStatsSummary(),
        api.getSettings(),
        api.getSyncStatus(),
        api.getAccounts(),
      ]);
      const startingBalance = settingsRes.defaultBalance || 25000;
      const riskPercentVal = settingsRes.riskPerTradePercent || 1.0;
      const netPnL = statsRes.totalNetPnL || 0;
      const calculated = calculateTradeRR(netPnL, startingBalance, riskPercentVal);
      setGlobalRR(calculated);
      setSyncStatus(syncRes);
      setAccounts(accountsRes);
    } catch (err) {
      console.error("Error fetching global data in top header bar:", err);
    }
  };

  useEffect(() => {
    fetchGlobalData();
    // Poll every 30 seconds (each poll recalculates stats on the server)
    const interval = setInterval(fetchGlobalData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectAccount = async (id: string) => {
    try {
      await api.setActiveAccount(id);
      setIsSelectorOpen(false);
      window.location.reload();
    } catch (err: any) {
      alert(`Failed to switch active account: ${err.message}`);
    }
  };

  const handleDeleteActiveAccount = async () => {
    const active = accounts.find(acc => acc.isActive);
    if (!active) return;
    
    const confirmMsg = lang === 'he'
      ? `אזהרה! האם למחוק את החשבון #${active.login} ואת כל העסקאות המשוייכות אליו לצמיתות?`
      : `WARNING! Are you sure you want to delete MT5 Account #${active.login} and all of its synced trades permanently?`;
      
    if (!window.confirm(confirmMsg)) return;
    
    try {
      await api.deleteAccount(active._id);
      setIsSelectorOpen(false);
      window.location.reload();
    } catch (err: any) {
      alert(`Failed to delete account: ${err.message}`);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login || !server) {
      alert(lang === 'he' ? 'נא למלא מספר חשבון ושרת' : 'Please fill in Login ID and Server.');
      return;
    }
    setCreatingAccount(true);
    try {
      // The backend verifies the MT5 login and imports the full trade history before responding
      await api.createAccount({
        login: Number(login),
        password,
        server,
        path,
        name: name || `Account ${login}`,
        defaultBalance: Number(defaultBalance),
        riskPerTradePercent: Number(riskPercent),
        syncHistoryDepth,
      });
      setIsModalOpen(false);
      setLogin('');
      setPassword('');
      setServer('');
      setPath('');
      setName('');
      setDefaultBalance('25000');
      setRiskPercent('1.0');
      setSyncHistoryDepth('all');
      window.location.reload();
    } catch (err: any) {
      alert(lang === 'he' ? `שגיאה ביצירת חשבון: ${err.message}` : `Error creating account: ${err.message}`);
    } finally {
      setCreatingAccount(false);
    }
  };

  const navigation = [
    { name: t('dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('tradesLog'), href: '/trades', icon: TrendingUp },
    { name: t('calendar'), href: '/calendar', icon: Calendar },
    { name: t('analytics'), href: '/analytics', icon: LineChart },
    { name: t('syncCenter'), href: '/sync', icon: RefreshCw },
    { name: t('account'), href: '/account', icon: Wallet },
    { name: t('settings'), href: '/settings', icon: SettingsIcon },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const activeAccount = accounts.find(acc => acc.isActive);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-background text-slate-800 dark:text-slate-100 font-sans">
      
      {/* Sidebar (Desktop View) */}
      <aside className={`hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white dark:bg-card border-r border-slate-200 dark:border-border z-20 ${
        lang === 'he' ? 'right-0 border-l border-r-0' : 'left-0'
      }`}>
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto">
          {/* Logo Section */}
          <div className="flex items-center flex-shrink-0 px-6 mb-8 gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white bg-clip-text text-transparent bg-gradient-to-r from-slate-900 dark:from-white via-slate-700 dark:via-slate-200 to-slate-500 dark:to-slate-400">
                TraderNet <span className="text-primary font-black">Journal</span>
              </span>
              <div className="text-[9px] text-muted tracking-wider uppercase -mt-0.5 font-bold">
                {lang === 'he' ? 'מבית TraderNet' : 'by TraderNet'}
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-4 space-y-1">
            {navigation.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 ${
                    active
                      ? 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon
                    className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors duration-200 ${
                      lang === 'he' ? 'ml-3 mr-0' : ''
                    } ${
                      active ? 'text-white' : 'text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                    }`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Dynamic MT5 Account Profile & Status Selector Card */}
        <div className="flex-shrink-0 flex flex-col border-t border-slate-200 dark:border-border p-4 bg-slate-50 dark:bg-slate-900/60 relative">
          
          {/* Active MT5 Tracker Account Status Card */}
          <div 
            onClick={() => setIsSelectorOpen(!isSelectorOpen)}
            className="flex items-center justify-between p-2 hover:bg-slate-200/55 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition select-none"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {activeAccount ? (
                <div className="h-9 w-9 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center font-black text-[9px] shadow-sm flex-shrink-0">
                  LIVE
                </div>
              ) : (
                <div className="h-9 w-9 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center justify-center font-black text-[9px] shadow-sm flex-shrink-0 animate-pulse">
                  OFF
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                {activeAccount ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                      <span className="text-[9px] text-emerald-500 font-black uppercase tracking-wider">
                        {lang === 'he' ? 'פרופיל פעיל' : 'Active Profile'}
                      </span>
                    </div>
                    <p className="text-[11px] font-extrabold text-slate-800 dark:text-white truncate mt-0.5">
                      {activeAccount.name || `Account ${activeAccount.login}`}
                    </p>
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">
                      #{activeAccount.login}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                      <span className="text-[9px] text-rose-500 font-black uppercase tracking-wider">
                        {lang === 'he' ? 'אין פרופיל' : 'No Active Profile'}
                      </span>
                    </div>
                    <p className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                      {lang === 'he' ? 'לחץ להוספת חשבון' : 'Click to add account...'}
                    </p>
                  </>
                )}
              </div>
            </div>
            
            <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
          </div>

          {/* Selector Dropdown Panel */}
          {isSelectorOpen && (
            <div 
              className="absolute bottom-16 left-4 right-4 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl shadow-2xl p-2.5 space-y-1.5 animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase px-2 py-1 tracking-wider border-b border-slate-100 dark:border-border/30 mb-1 flex items-center justify-between">
                <span>{lang === 'he' ? 'בחר פרופיל חשבון' : 'SELECT ACCOUNT PROFILE'}</span>
                <button 
                  onClick={() => setIsSelectorOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {accounts.length > 0 ? (
                  accounts.map((acc) => (
                    <div 
                      key={acc._id}
                      onClick={() => handleSelectAccount(acc._id)}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition ${
                        acc.isActive 
                          ? 'bg-primary/10 border border-primary/20 text-primary' 
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-transparent'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{acc.name || `Account ${acc.login}`}</p>
                        <p className="text-[9px] text-slate-400 font-mono truncate">#{acc.login} • {acc.server}</p>
                      </div>
                      {acc.isActive && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-slate-400 italic px-2 py-2 text-center">
                    {lang === 'he' ? 'טרם נוספו חשבונות' : 'No accounts added yet.'}
                  </p>
                )}
              </div>

              <div className="border-t border-slate-100 dark:border-border/30 pt-2 mt-1 flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    setIsSelectorOpen(false);
                    setIsModalOpen(true);
                  }}
                  className="w-full py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-lg transition text-center flex items-center justify-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{lang === 'he' ? 'הוסף חשבון חדש' : 'Add New Account'}</span>
                </button>
                {activeAccount && (
                  <button
                    onClick={handleDeleteActiveAccount}
                    className="w-full py-1.5 bg-danger/10 hover:bg-danger/15 text-danger text-[10px] font-bold rounded-lg transition text-center"
                  >
                    {lang === 'he' ? 'מחק חשבון פעיל זה' : 'Delete Active Account'}
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`flex flex-col flex-1 min-h-screen ${
        lang === 'he' ? 'md:pr-64 md:pl-0' : 'md:pl-64 md:pr-0'
      }`}>
        
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-white/70 dark:bg-card/75 backdrop-blur-md border-b border-slate-200 dark:border-border">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg md:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="hidden md:flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                {lang === 'he' ? 'סטטוס מעקב:' : 'SYNC TRACKER:'}
              </span>
              {syncStatus?.status === 'running' || syncStatus?.status === 'stopped' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="text-[10px] text-success font-bold uppercase tracking-wider">
                    {lang === 'he' ? 'סינכרון פעיל' : 'Sync Active'}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
                  <span className="text-[10px] text-danger font-bold uppercase tracking-wider">
                    {lang === 'he' ? 'חיבור כבוי' : 'Sync Offline'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right controls: Theme & Language */}
          <div className="flex items-center gap-3">
            {/* Prominent Cumulative R:R Display */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-violet-500/10 dark:bg-violet-950/20 border border-violet-500/20 dark:border-violet-500/30 rounded-xl shadow-sm">
              <span className="text-[9px] md:text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">
                {lang === 'he' ? 'רווח יחסי מצטבר' : 'TOTAL R:R'}
              </span>
              <span className={`text-xs md:text-sm font-black ${globalRR >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {globalRR >= 0 ? `+${globalRR.toFixed(2)}R` : `${globalRR.toFixed(2)}R`}
              </span>
            </div>
            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-border/60 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition text-xs font-bold text-slate-700 dark:text-slate-200 animate-fade-in"
            >
              {lang === 'he' ? (
                <span className="flex items-center gap-1.5">
                  <span>🇺🇸</span>
                  <span>English</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span>🇮🇱</span>
                  <span>עברית</span>
                </span>
              )}
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-border/60 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition text-slate-600 dark:text-slate-300"
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Mobile Full Screen Menu Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden bg-white/95 dark:bg-background/95 backdrop-blur-lg flex flex-col pt-20 px-6 animate-fade-in">
            <nav className="space-y-3">
              {navigation.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-5 py-4 text-base font-bold rounded-2xl ${
                      active 
                        ? 'bg-primary text-white shadow-lg' 
                        : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-card border border-slate-200 dark:border-border'
                    }`}
                  >
                    <Icon className={`mr-4 h-6 w-6 ${lang === 'he' ? 'ml-4 mr-0' : ''}`} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* Actual Content Wrapper */}
        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* Mobile Bottom Navigation (Always present on mobile, hides on desktop) */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden flex items-center justify-around h-16 bg-white/90 dark:bg-card/90 backdrop-blur-lg border-t border-slate-200 dark:border-border px-2">
          {navigation.slice(0, 5).map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-bold transition ${
                  active ? 'text-primary' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5 mb-0.5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Add MT5 Account Dialog Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border p-6 rounded-2xl w-full max-w-md shadow-2xl relative text-slate-800 dark:text-slate-100">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <h3 className="text-base font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <span>{lang === 'he' ? 'פרטי התחברות לשרת MT5' : 'MT5 Connection Details'}</span>
            </h3>

            <form onSubmit={handleCreateAccount} className="space-y-3.5 text-xs text-slate-700 dark:text-slate-300 font-bold">
              <div>
                <label className="block mb-1 text-[10px] uppercase text-slate-400 tracking-wider">
                  {lang === 'he' ? 'תיאור / שם החשבון' : 'Account Name (Description)'}
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. My FTMO Live Account" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-slate-800 dark:text-white font-semibold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-[10px] uppercase text-slate-400 tracking-wider">
                    {lang === 'he' ? 'מספר חשבון (Login) *' : 'MT5 Login ID *'}
                  </label>
                  <input 
                    type="number" 
                    required 
                    placeholder="e.g. 50091234" 
                    value={login} 
                    onChange={(e) => setLogin(e.target.value)} 
                    className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-slate-800 dark:text-white font-semibold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-[10px] uppercase text-slate-400 tracking-wider">
                    {lang === 'he' ? 'שם שרת ברוקר *' : 'MT5 Broker Server *'}
                  </label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. FTMO-Demo" 
                    value={server} 
                    onChange={(e) => setServer(e.target.value)} 
                    className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-slate-800 dark:text-white font-semibold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1 text-[10px] uppercase text-slate-400 tracking-wider">
                  {lang === 'he' ? 'סיסמת משקיע/סוחר (אופציונלי)' : 'MT5 Password (Optional)'}
                </label>
                <input 
                  type="password" 
                  placeholder="Only if required by python worker" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-slate-800 dark:text-white font-semibold focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 text-[10px] uppercase text-slate-400 tracking-wider">
                  {lang === 'he' ? 'נתיב לקובץ ההרצה terminal64.exe (אופציונלי)' : 'MT5 Executable Path (Optional)'}
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. C:\Program Files\MetaTrader 5\terminal64.exe" 
                  value={path} 
                  onChange={(e) => setPath(e.target.value)} 
                  className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-slate-800 dark:text-white font-semibold focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 text-[10px] uppercase text-slate-400 tracking-wider">
                  {lang === 'he' ? 'טווח היסטוריית סינכרון' : 'Sync History Depth'}
                </label>
                <select
                  value={syncHistoryDepth}
                  onChange={(e) => setSyncHistoryDepth(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-slate-800 dark:text-white font-semibold focus:outline-none"
                >
                  <option value="all">{lang === 'he' ? 'מקס היסטוריה טעונה (הכל)' : 'All loaded history (Max)'}</option>
                  <option value="year">{lang === 'he' ? 'שנה אחורה' : '1 Year Back'}</option>
                  <option value="month">{lang === 'he' ? '30 ימים אחורה' : '30 Days Back'}</option>
                  <option value="week">{lang === 'he' ? '7 ימים אחורה' : '7 Days Back'}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block mb-1 text-[10px] uppercase text-slate-400 tracking-wider">
                    {lang === 'he' ? 'הון תיק התחלתי ($) *' : 'Default Balance ($) *'}
                  </label>
                  <input 
                    type="number" 
                    required
                    value={defaultBalance} 
                    onChange={(e) => setDefaultBalance(e.target.value)} 
                    className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-slate-800 dark:text-white font-semibold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-[10px] uppercase text-slate-400 tracking-wider">
                    {lang === 'he' ? 'סיכון מוגדר לעסקה (%) *' : 'Risk Per Trade (%) *'}
                  </label>
                  <input 
                    type="number" 
                    step="0.1"
                    required
                    value={riskPercent} 
                    onChange={(e) => setRiskPercent(e.target.value)} 
                    className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-border rounded-xl text-slate-800 dark:text-white font-semibold focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white text-xs font-bold rounded-xl transition"
                >
                  {lang === 'he' ? 'ביטול' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={creatingAccount}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-60 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2"
                >
                  {creatingAccount && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {creatingAccount
                    ? (lang === 'he' ? 'מתחבר ומייבא היסטוריה...' : 'Connecting & importing history...')
                    : (lang === 'he' ? 'שמור חשבון' : 'Save Connection')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default SidebarLayout;
