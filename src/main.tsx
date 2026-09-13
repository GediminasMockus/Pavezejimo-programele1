import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { UiTranslationBridge } from './components/UiTranslationBridge';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiTranslationBridge />
    <App />
  </StrictMode>
);
