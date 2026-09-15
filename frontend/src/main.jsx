import React from 'react';

import ReactDOM from 'react-dom/client';

import { BrowserRouter } from 'react-router-dom';

import App from './App';

import { ToastProvider } from './context/ToastContext';

import { ConfirmProvider } from './context/ConfirmContext';

import { LocalRunnerProvider } from './context/LocalRunnerContext';

import './styles/tokens.css';

import './styles/foundation.css';

import './styles/redesign.css';

import './styles/pages.css';

import './styles/features.css';

import './styles/glass.css';

import './styles/recorder.css';

ReactDOM.createRoot(document.getElementById('root')).render(

  <React.StrictMode>

    <BrowserRouter>

      <ToastProvider>

        <ConfirmProvider>

          <LocalRunnerProvider>

            <App />

          </LocalRunnerProvider>

        </ConfirmProvider>

      </ToastProvider>

    </BrowserRouter>

  </React.StrictMode>

);

