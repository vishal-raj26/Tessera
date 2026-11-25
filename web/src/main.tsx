import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { THEME, TonConnectUIProvider } from '@tonconnect/ui-react';
import { MotionConfig } from 'framer-motion';
import './index.css';
import './ui.css';
import App from './App';

const manifestUrl = import.meta.env.VITE_TONCONNECT_MANIFEST ?? `${location.origin}/tonconnect-manifest.json`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      uiPreferences={{
        theme: THEME.DARK,
        borderRadius: 'm',
        // the wallet picker in the app's own colours
        colorsSet: {
          [THEME.DARK]: {
            connectButton: { background: '#f5f3ef', foreground: '#0a0a0a' },
            accent: '#e8875f',
            background: { primary: '#131313', secondary: '#1b1b1b', segment: '#1b1b1b', tint: '#232323', qr: '#f5f3ef' },
            text: { primary: '#f5f3ef', secondary: '#8f8b85' },
          },
        },
      }}
      actionsConfiguration={{ twaReturnUrl: (import.meta.env.VITE_TWA_RETURN_URL as `${string}://${string}`) || undefined }}
    >
      {/* Reduce Motion (iOS/Android setting) turns movement into simple fades everywhere */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </TonConnectUIProvider>
  </StrictMode>,
);
