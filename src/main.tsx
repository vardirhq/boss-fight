import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { App } from './App';
import { Db } from './db/sqlite';
import { loadState } from './db/repository';
import { GameProvider } from './store/GameContext';
import type { GameState } from './game/types';

registerSW({ immediate: true });

function Boot() {
  const [ready, setReady] = useState<{ db: Db; initial: GameState } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await Db.open();
        const initial = loadState(db);
        if (!cancelled) setReady({ db, initial });
      } catch (err) {
        console.error('[boot] failed to open database', err);
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div style={centered}>
        <div style={{ fontFamily: "'Press Start 2P'", fontSize: 12, color: '#E0564A' }}>Kunne ikke laste</div>
        <div style={{ fontSize: 13, color: '#6C7486', marginTop: 12, maxWidth: 320, textAlign: 'center' }}>{error}</div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div style={centered}>
        <div style={{ fontFamily: "'Press Start 2P'", fontSize: 14, color: '#F4B942' }}>BOSS KAMP</div>
      </div>
    );
  }
  return (
    <GameProvider db={ready.db} initial={ready.initial}>
      <App />
    </GameProvider>
  );
}

const centered: React.CSSProperties = {
  height: '100dvh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', background: '#090b10',
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
