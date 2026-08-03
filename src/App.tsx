import { useGame } from './store/GameContext';
import { BattleScreen } from './screens/BattleScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PartyScreen } from './screens/PartyScreen';
import { RewardsScreen } from './screens/RewardsScreen';
import { BagScreen } from './screens/BagScreen';
import { BottomNav } from './screens/BottomNav';
import { BossManager, ChoreEditor, PartyManager } from './screens/managers';
import { SettingsPanel, Splash, Onboarding, Toast } from './screens/overlays';
import { GOLD, useT } from './ui/common';

const PS = "'Press Start 2P'";

export function App() {
  const { state, actions } = useGame();
  const t = useT();
  const { ui, game } = state;
  const currentBoss = game.bosses.find((boss) => boss.id === game.currentBossId) ?? game.bosses[0];
  const showBattleIntro = ui.tab === 'battle' && ui.intro && currentBoss;

  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative', background: 'linear-gradient(180deg,#12161f 0%,#0c0f16 60%,#090b10 100%)', display: 'flex', flexDirection: 'column', color: '#F6EBDD', overflow: 'hidden' }}>
      <div className={`scr${ui.tab === 'battle' ? ' battle-scroll' : ''}`} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {ui.tab === 'battle' && <BattleScreen />}
        {ui.tab === 'home' && <HomeScreen />}
        {ui.tab === 'party' && <PartyScreen />}
        {ui.tab === 'rewards' && <RewardsScreen />}
        {ui.tab === 'inv' && <BagScreen />}
      </div>

      <Toast />
      {ui.editBosses && <BossManager />}
      {ui.editParty && <PartyManager />}
      {ui.editingChores && <ChoreEditor />}
      {ui.settingsOpen && <SettingsPanel />}
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
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(7,9,13,.78)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: PS, fontSize: 9, color: '#E0564A', letterSpacing: 2, animation: 'victoryPop .4s ease-out both' }}>{t.introAppears}</div>
          <div style={{ fontFamily: PS, fontSize: 22, color: '#F6EBDD', textShadow: `0 3px 0 rgba(0,0,0,.6),0 0 20px ${GOLD}66`, marginTop: 18, lineHeight: 1.5, textTransform: 'uppercase', animation: 'introSlam .7s cubic-bezier(.2,.9,.2,1) both' }}>{currentBoss.name}</div>
          <div style={{ marginTop: 24, fontSize: 13, color: '#A8B0BF', letterSpacing: 1, animation: 'floatBadge 1.4s ease-in-out infinite' }}>{t.tapStart}</div>
        </div>
      )}
    </div>
  );
}
