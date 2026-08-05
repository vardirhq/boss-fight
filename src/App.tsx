import { useEffect, useRef, useState } from 'react';
import { useGame } from './store/GameContext';
import { BattleScreen } from './screens/BattleScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PartyScreen } from './screens/PartyScreen';
import { RewardsScreen } from './screens/RewardsScreen';
import { BagScreen } from './screens/BagScreen';
import { BottomNav } from './screens/BottomNav';
import { BossManager, ChoreEditor, PartyManager } from './screens/managers';
import { SettingsPanel, Splash, Onboarding, Toast } from './screens/overlays';
import { AccountSettings } from './online/AccountSettings';
import { mayManageHousehold, useOnline } from './online/OnlineContext';
import { serverSyncToGameState } from './online/gameSync';
import { GOLD, useT } from './ui/common';

const PS = "'Press Start 2P'";
const LEGACY_NEW_FIGHTER_NAME = 'Ny kjemper';

export function App() {
  const { state, actions, persistence } = useGame();
  const online = useOnline();
  const loadedServerConfiguration = useRef<string | null>(null);
  const onlineRef = useRef(online);
  const gameRef = useRef(state.game);
  const syncInFlight = useRef(false);
  onlineRef.current = online;
  gameRef.current = state.game;
  const t = useT();
  const { ui, game } = state;
  const [accountOpen, setAccountOpen] = useState(false);
  const currentBoss = game.bosses.find((boss) => boss.id === game.currentBossId) ?? game.bosses[0];
  const householdReady = Boolean(online.state.householdId && online.state.configurationConnectedAt);
  const showBattleIntro = ui.phase === 'app' && householdReady && ui.tab === 'battle' && ui.intro && currentBoss;
  const showAccountSetup = ui.phase === 'app' && !householdReady;
  const accountCopy = game.settings.lang === 'en'
    ? { title: 'Account & household', back: 'Back', connected: 'Connected household', shared: 'Shared household device' }
    : { title: 'Konto og husholdning', back: 'Tilbake', connected: 'Tilkoblet husholdning', shared: 'Delt familieenhet' };
  const accountSubtitle = online.state.mode === 'household-device'
    ? `${accountCopy.shared}${online.state.householdName ? ` · ${online.state.householdName}` : ''}`
    : [online.state.account?.displayName, online.state.householdName || accountCopy.connected].filter(Boolean).join(' · ');

  useEffect(() => {
    for (const fighter of game.fighters) {
      if (fighter.name === LEGACY_NEW_FIGHTER_NAME) {
        actions.editFighter(fighter.id, { name: '' });
      }
    }
  }, [actions, game.fighters]);

  useEffect(() => {
    if (!ui.settingsOpen) setAccountOpen(false);
  }, [ui.settingsOpen]);

  useEffect(() => {
    const { householdId, configurationConnectedAt, status } = online.state;
    if (!householdId || !configurationConnectedAt || status !== 'authenticated') return;
    const key = `${householdId}:${configurationConnectedAt}`;
    if (loadedServerConfiguration.current === key) return;
    loadedServerConfiguration.current = key;
    void online.actions.syncNow()
      .then((sync) => {
        if (sync) actions.replaceGame(serverSyncToGameState(sync, state.game));
      })
      .catch(() => {
        // Keep the last local server snapshot available while offline. A manual
        // fetch or the next app start will try the authoritative server again.
        loadedServerConfiguration.current = null;
      });
  }, [actions, online.actions, online.state.configurationConnectedAt, online.state.householdId, online.state.status, state.game]);

  useEffect(() => {
    if (!online.state.householdId || !online.state.configurationConnectedAt) return;
    const synchronize = () => {
      if (syncInFlight.current || document.visibilityState === 'hidden') return;
      syncInFlight.current = true;
      void onlineRef.current.actions.syncNow()
        .then((sync) => {
          if (sync) actions.replaceGame(serverSyncToGameState(sync, gameRef.current));
        })
        .catch(() => undefined)
        .finally(() => { syncInFlight.current = false; });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') synchronize();
    };
    window.addEventListener('online', synchronize);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(synchronize, 30_000);
    return () => {
      window.removeEventListener('online', synchronize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [actions, online.state.configurationConnectedAt, online.state.householdId]);

  return (
    <div className="app-shell" style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative', background: 'linear-gradient(180deg,#12161f 0%,#0c0f16 60%,#090b10 100%)', display: 'flex', flexDirection: 'column', color: '#F6EBDD', overflow: 'hidden' }}>
      {persistence.issue && ui.phase === 'app' && (
        <div role="alert" aria-live="assertive" style={{ flex: 'none', padding: '10px 12px', paddingTop: 'calc(10px + env(safe-area-inset-top))', background: persistence.issue === 'opfs-unavailable' ? '#30250f' : '#3a1719', borderBottom: `1px solid ${persistence.issue === 'opfs-unavailable' ? '#785c20' : '#873f44'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', zIndex: 89 }}>
          <span style={{ maxWidth: 620, fontSize: 12, lineHeight: 1.45, fontWeight: 650, color: '#f6ebdd' }}>
            {persistence.issue === 'restore-failed' ? t.persistenceRestoreFailed
              : persistence.issue === 'write-failed' ? t.persistenceWriteFailed
                : t.persistenceFallback}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            {persistence.issue === 'write-failed' && <button type="button" onClick={actions.retrySave} style={warningButton}>{t.retrySave}</button>}
            <button type="button" onClick={actions.downloadBackup} style={warningButton}>{t.downloadBackup}</button>
          </span>
        </div>
      )}
      <div className={`scr app-content${ui.tab === 'battle' ? ' battle-scroll' : ''}`} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {ui.tab === 'battle' && <BattleScreen />}
        {ui.tab === 'home' && <HomeScreen />}
        {ui.tab === 'party' && <PartyScreen />}
        {ui.tab === 'rewards' && <RewardsScreen />}
        {ui.tab === 'inv' && <BagScreen />}
      </div>

      <Toast />
      {ui.editBosses && mayManageHousehold(online.state) && <BossManager />}
      {ui.editParty && mayManageHousehold(online.state) && <PartyManager />}
      {ui.editingChores && mayManageHousehold(online.state) && <ChoreEditor />}
      {ui.settingsOpen && !accountOpen && (
        <SettingsPanel
          onOpenAccount={() => setAccountOpen(true)}
          accountSubtitle={accountSubtitle}
          accountConnected={householdReady}
        />
      )}
      {ui.settingsOpen && accountOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 92, background: '#0b0e16', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 'none', minHeight: 64, padding: 'calc(12px + env(safe-area-inset-top)) 16px 10px', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(11,14,22,.96)' }}>
            <button type="button" aria-label={accountCopy.back} onClick={() => setAccountOpen(false)} style={{ width: 42, height: 42, padding: 0, border: '1px solid #293143', borderRadius: '50%', background: '#171d2a', color: '#d9deea', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div style={{ flex: 1, fontSize: 21, fontWeight: 800, letterSpacing: '-.35px', color: '#f6ebdd' }}>{accountCopy.title}</div>
            <div style={{ width: 42 }} />
          </div>
          <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: 18 }}><AccountSettings lang={game.settings.lang} /></div>
        </div>
      )}
      {showAccountSetup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 96, background: '#0b0e16', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 'none', padding: 'calc(24px + env(safe-area-inset-top)) 20px 14px', textAlign: 'center' }}>
            <div style={{ fontFamily: PS, fontSize: 13, color: GOLD }}>BOSS KAMP</div>
          </div>
          <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: '8px 18px calc(24px + env(safe-area-inset-bottom))' }}>
            <AccountSettings lang={game.settings.lang} setup />
          </div>
        </div>
      )}
      {ui.phase === 'splash' && <Splash />}
      {ui.phase === 'onboarding' && <Onboarding />}

      <BottomNav />

      {showBattleIntro && (
        <div
          role="button"
          tabIndex={0}
          aria-label={t.tapStart}
          onClick={actions.startFight}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') actions.startFight();
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(7,9,13,.78)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 24, textAlign: 'center' }}
        >
          <div style={{ fontFamily: PS, fontSize: 9, color: '#E0564A', letterSpacing: 2, animation: 'victoryPop .4s ease-out both' }}>{t.introAppears}</div>
          <div style={{ fontFamily: PS, fontSize: 22, color: '#F6EBDD', textShadow: `0 3px 0 rgba(0,0,0,.6),0 0 20px ${GOLD}66`, marginTop: 18, lineHeight: 1.5, textTransform: 'uppercase', animation: 'introSlam .7s cubic-bezier(.2,.9,.2,1) both' }}>{currentBoss.name}</div>
          <div style={{ marginTop: 24, fontSize: 13, color: '#A8B0BF', letterSpacing: 1, animation: 'floatBadge 1.4s ease-in-out infinite' }}>{t.tapStart}</div>
        </div>
      )}
    </div>
  );
}

const warningButton: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, background: 'rgba(255,255,255,.1)',
  color: '#fff', padding: '7px 9px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
};
