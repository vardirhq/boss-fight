import { useGame } from '../store/GameContext';
import { useT, GOLD, DIM } from '../ui/common';
import type { Tab } from '../game/types';

export function BottomNav() {
  const { state, actions } = useGame();
  const t = useT();
  const tab = state.ui.tab;

  return (
    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px 8px calc(14px + env(safe-area-inset-bottom))', background: 'rgba(10,12,18,.92)', borderTop: '1px solid #222a3c', backdropFilter: 'blur(12px)' }}>
      <NavBtn tab="home" active={tab === 'home'} label={t.navBosses} onClick={() => actions.go('home')}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d="M4 4h6l1 3h9l-1 6H5z" /><path d="M4 4v16" /></svg>
      </NavBtn>
      <NavBtn tab="party" active={tab === 'party'} label={t.navTeam} onClick={() => actions.go('party')}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.2" /><path d="M4 19v-1a5 5 0 0 1 10 0v1" /><path d="M15.5 14.5a4 4 0 0 1 4.5 4v.5" /></svg>
      </NavBtn>
      <BattleNavBtn active={tab === 'battle'} label={t.navBattle} onClick={() => actions.go('battle')} />
      <NavBtn tab="rewards" active={tab === 'rewards'} label={t.navTreasure} onClick={() => actions.go('rewards')}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7S9.5 2.5 7 4.5 8 7 12 7zM12 7s2.5-4.5 5-2.5S16 7 12 7z" /></svg>
      </NavBtn>
      <NavBtn tab="inv" active={tab === 'inv'} label={t.navBag} onClick={() => actions.go('inv')}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 0 1 12 0v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" /><path d="M9 9a3 3 0 0 1 6 0" /><path d="M6 13h12" /></svg>
      </NavBtn>
    </div>
  );
}

function NavBtn({ active, label, onClick, children }: { tab: Tab; active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '4px 8px', color: active ? GOLD : DIM }}>
      {children}
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: .3 }}>{label}</span>
    </button>
  );
}

function BattleNavBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0 8px', color: active ? GOLD : DIM }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: active ? 'linear-gradient(180deg,#ffd873,#F4B942)' : '#1b2130', border: `1px solid ${active ? GOLD : '#333c50'}`, display: 'grid', placeItems: 'center', marginTop: -16, boxShadow: '0 8px 18px rgba(0,0,0,.4)', color: active ? '#20160A' : DIM }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 3.5 20 3l-.5 5.5-9 9-4.5.5.5-4.5z" /><path d="m6.5 13.5 4 4" /><path d="M3 21l3.5-3.5" /></svg>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .3 }}>{label}</span>
    </button>
  );
}
