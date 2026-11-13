import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { CrisisCacheProvider } from './context/CrisisCacheContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <CrisisCacheProvider>
      <App />
    </CrisisCacheProvider>
  </React.StrictMode>
);
