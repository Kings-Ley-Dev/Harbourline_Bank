import React from 'react';  
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n/index.js';
import { ipLanguageFallback } from './i18n/index.js';
import { AuthProvider } from './auth.jsx';
import App from './App.jsx';
import './styles.css';

ipLanguageFallback();
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
