import { useGame } from './store/GameContext';
import { BattleScreen } from './screens/BattleScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PartyScreen } from './screens/PartyScreen';
import { RewardsScreen } from './screens/RewardsScreen';
import { BagScreen } from './screens/BagScreen';
import { BottomNav } from './screens/BottomNav';
import { BossManager, ChoreEditor, PartyManager } from './screens/managers';
import { SettingsPanel, Splash, Onboarding, Toast } from './screens/overlays';

export function App() {
  const { state } = useGame();
  const { ui } = state;

  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative', background: 'linear-gradient(180deg,#12161f 0%,#0c0f16 60%,#090b10 100%)', display: 'flex', flexDirection: 'column', color: '#F6EBDD', overflow: 'hidden' }}>
      <div className="scr" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
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
    </div>
  );
}
