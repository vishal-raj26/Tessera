import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import './index.css';
import App from './App';

const manifestUrl = import.meta.env.VITE_TONCONNECT_MANIFEST ?? `${location.origin}/tonconnect-manifest.json`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      uiPreferences={{ borderRadius: 'm' }}
      actionsConfiguration={{ twaReturnUrl: (import.meta.env.VITE_TWA_RETURN_URL as `${string}://${string}`) || undefined }}
    >
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
);
