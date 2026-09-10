import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './state/AuthContext';
import { ToastProvider } from './state/ToastContext';
import { I18nProvider } from './state/I18nContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </HashRouter>
  </React.StrictMode>
);
