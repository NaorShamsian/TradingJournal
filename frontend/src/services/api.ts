import {
  Trade,
  SyncStatus,
  Settings,
  StatsSummary,
  EquityCurvePoint,
  CalendarDaySummary,
  SymbolStat,
  SessionStat,
  StrategyStat,
  HourStat,
  DrawdownPoint,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const api = {
  // Trades API
  getTrades: async (params: {
    search?: string;
    symbol?: string;
    strategy?: string;
    session?: string;
    outcome?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ trades: Trade[]; pagination: { total: number; page: number; limit: number; pages: number } }> => {
    const url = new URL(`${API_BASE_URL}/trades`);
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        url.searchParams.append(key, String(val));
      }
    });
    const res = await fetch(url.toString());
    return handleResponse(res);
  },

  getTradeById: async (id: string): Promise<Trade> => {
    const res = await fetch(`${API_BASE_URL}/trades/${id}`);
    return handleResponse(res);
  },

  updateTrade: async (id: string, data: Partial<Trade>): Promise<Trade> => {
    const res = await fetch(`${API_BASE_URL}/trades/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  deleteTrade: async (id: string): Promise<{ message: string; id: string }> => {
    const res = await fetch(`${API_BASE_URL}/trades/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  importTrades: async (trades: any[]): Promise<{ importedCount: number; skippedDuplicates: number; errors: string[]; importedTrades: Trade[] }> => {
    const res = await fetch(`${API_BASE_URL}/trades/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trades),
    });
    return handleResponse(res);
  },

  resetDatabase: async (): Promise<{ message: string }> => {
    const res = await fetch(`${API_BASE_URL}/trades/reset`, {
      method: 'POST',
    });
    return handleResponse(res);
  },

  // Accounts API
  getAccounts: async (): Promise<any[]> => {
    const res = await fetch(`${API_BASE_URL}/accounts`);
    return handleResponse(res);
  },

  createAccount: async (data: any): Promise<any> => {
    const res = await fetch(`${API_BASE_URL}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  setActiveAccount: async (id: string): Promise<any> => {
    const res = await fetch(`${API_BASE_URL}/accounts/${id}/active`, {
      method: 'PUT',
    });
    return handleResponse(res);
  },

  deleteAccount: async (id: string): Promise<any> => {
    const res = await fetch(`${API_BASE_URL}/accounts/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  // Stats API
  getStatsSummary: async (): Promise<StatsSummary> => {
    const res = await fetch(`${API_BASE_URL}/stats/summary`);
    return handleResponse(res);
  },

  getEquityCurve: async (): Promise<{ initialBalance: number; curve: EquityCurvePoint[] }> => {
    const res = await fetch(`${API_BASE_URL}/stats/equity-curve`);
    return handleResponse(res);
  },

  getCalendarStats: async (): Promise<CalendarDaySummary[]> => {
    const res = await fetch(`${API_BASE_URL}/stats/calendar`);
    return handleResponse(res);
  },

  getStatsBySymbol: async (): Promise<SymbolStat[]> => {
    const res = await fetch(`${API_BASE_URL}/stats/by-symbol`);
    return handleResponse(res);
  },

  getStatsBySession: async (): Promise<SessionStat[]> => {
    const res = await fetch(`${API_BASE_URL}/stats/by-session`);
    return handleResponse(res);
  },

  getStatsByStrategy: async (): Promise<StrategyStat[]> => {
    const res = await fetch(`${API_BASE_URL}/stats/by-strategy`);
    return handleResponse(res);
  },

  getStatsByHour: async (): Promise<HourStat[]> => {
    const res = await fetch(`${API_BASE_URL}/stats/by-hour`);
    return handleResponse(res);
  },

  getDrawdownStats: async (): Promise<DrawdownPoint[]> => {
    const res = await fetch(`${API_BASE_URL}/stats/drawdown`);
    return handleResponse(res);
  },

  // Sync API
  getSyncStatus: async (): Promise<SyncStatus> => {
    const res = await fetch(`${API_BASE_URL}/sync/status`);
    return handleResponse(res);
  },

  updateSyncStatus: async (data: Partial<SyncStatus>): Promise<SyncStatus> => {
    const res = await fetch(`${API_BASE_URL}/sync/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  triggerSync: async (): Promise<{ message: string; status: SyncStatus }> => {
    const res = await fetch(`${API_BASE_URL}/sync/mt5`, {
      method: 'POST',
    });
    return handleResponse(res);
  },

  // Settings API
  getSettings: async (): Promise<Settings> => {
    const res = await fetch(`${API_BASE_URL}/settings`);
    return handleResponse(res);
  },

  updateSettings: async (data: Partial<Settings>): Promise<Settings> => {
    const res = await fetch(`${API_BASE_URL}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
};
export default api;
