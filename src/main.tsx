import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { UiTranslationBridge } from './components/UiTranslationBridge';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <UiTranslationBridge />
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
