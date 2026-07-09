import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SidebarLayout from './layouts/SidebarLayout';
import Dashboard from './pages/Dashboard';
import Trades from './pages/Trades';
import TradeDetails from './pages/TradeDetails';
import Calendar from './pages/Calendar';
import Analytics from './pages/Analytics';
import SyncCenter from './pages/SyncCenter';
import SettingsPage from './pages/Settings';

export const App: React.FC = () => {
  return (
    <Router>
      <SidebarLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/trades/:id" element={<TradeDetails />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/sync" element={<SyncCenter />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </SidebarLayout>
    </Router>
  );
};
export default App;
