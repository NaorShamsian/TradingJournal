import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ThemeLangProvider } from './context/ThemeLangContext.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeLangProvider>
      <App />
    </ThemeLangProvider>
  </React.StrictMode>,
);
