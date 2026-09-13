import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { useUiTranslation } from '@/lib/useUiTranslation';

function TranslatedApp() {
  useUiTranslation();
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TranslatedApp />
  </StrictMode>
);
