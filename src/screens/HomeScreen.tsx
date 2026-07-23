import { useGame } from '../store/GameContext';
import { useT, GOLD } from '../ui/common';
import { EditIcon } from './BattleScreen';
import { maxHpOf, scheduleLabel, statusOf, whenText, hexA, type BossStatus } from '../game/logic';
import { DAY_SHORT } from '../game/i18n';
import type { Boss } from '../game/types';

const PS = "'Press Start 2P'";

export function HomeScreen() {
  const { state, actions } = useGame();
  const t = useT();
  const g = state.game;
  const lang = g.settings.lang;
  const now = new Date();

  const active = g.bosses.filter((b) => statusOf(b, g.goldenRevealed, now) === 'aktiv');
  const cleared = g.bosses.filter((b) => statusOf(b, g.goldenRevealed, now) === 'beseiret');

  const weekOrder = [1, 2, 3, 4, 5, 6, 0];
  const shortDays = DAY_SHORT[lang];
  const todayDow = now.getDay();
  const daily = g.bosses.filter((b) => b.trigger.type === 'daglig' || b.trigger.type === 'alltid');

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', width: '100%', padding: '24px 18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: PS, fontSize: 17, color: GOLD, textShadow: '0 3px 0 rgba(0,0,0,.4)', lineHeight: 1.4 }}>BOSS<br />KAMP</div>
          <div style={{ fontSize: 13, color: '#6C7486', marginTop: 8, fontWeight: 500 }}>{t.tagline}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={actions.openSettings} title={t.settings} style={hdrBtn}><GearIcon /></button>
          <button onClick={actions.openBossManager} title={t.bossMgrTitle} style={hdrBtn}><EditIcon size={16} /></button>
          <div onClick={() => actions.go('rewards')} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#14202a', border: '1px solid rgba(91,155,232,.4)', borderRadius: 13, padding: '10px 13px', cursor: 'pointer' }}>
            <div style={coinBlue} />
            <span style={{ fontFamily: PS, fontSize: 12, color: '#8fc0ff' }}>{g.pool}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <Stat value={g.victories} label={t.statBosses} color="#F6EBDD" />
        <Stat value={5} label={t.statStreak} color="#67D391" />
        <Stat value={g.pool} label={t.statPool} color="#8fc0ff" />
      </div>

      <SectionLabel color="#8fc0ff">{t.weekPlan}</SectionLabel>
      <div style={{ display: 'flex', gap: 5 }}>
        {weekOrder.map((di) => {
          const list = g.bosses.filter((b) => {
            if (b.trigger.type === 'ukentlig') return (b.trigger.day ?? 0) === di;
            if (b.trigger.type === 'månedlig') return new Date(now.getFullYear(), now.getMonth(), b.trigger.date ?? 1).getDay() === di;
            return false;
          });
          const isToday = di === todayDow;
          return (
            <div key={di} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 3px 9px', borderRadius: 12, border: `1px solid ${isToday ? 'rgba(244,185,66,.55)' : '#2b3346'}`, background: isToday ? 'rgba(244,185,66,.10)' : '#161c2b' }}>
              <div style={{ fontFamily: PS, fontSize: 7, letterSpacing: .5, color: isToday ? GOLD : '#8b93a5' }}>{shortDays[di]}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minHeight: 34, justifyContent: 'center' }}>
                {list.slice(0, 3).map((b) => <Thumb key={b.id} boss={b} size={30} />)}
                {list.length === 0 && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2b3346' }} />}
              </div>
            </div>
          );
        })}
      </div>
      {daily.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9, background: '#161c2b', border: '1px solid #2b3346', borderRadius: 12, padding: '9px 12px' }}>
          <span style={{ fontFamily: PS, fontSize: 7, color: '#67D391', letterSpacing: .5, whiteSpace: 'nowrap' }}>{t.everyDay}</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {daily.map((b) => <Thumb key={b.id} boss={b} size={26} />)}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <>
          <SectionLabel color="#E0564A">{t.activeNow}</SectionLabel>
          {active.map((b) => <BossCard key={b.id} boss={b} status="aktiv" />)}
        </>
      )}
      {cleared.length > 0 && (
        <>
          <SectionLabel color="#67D391">{t.defeated}</SectionLabel>
          {cleared.map((b) => <BossCard key={b.id} boss={b} status="beseiret" />)}
        </>
      )}
    </div>
  );
}

function BossCard({ boss, status }: { boss: Boss; status: BossStatus }) {
  const { state, actions } = useGame();
  const t = useT();
  const lang = state.game.settings.lang;
  const mh = maxHpOf(boss.chores);
  const note = boss.trigger.note || '';

  let statusLabel: string, statusColor: string, ctaLabel: string, metaLine: string, onTap: () => void, opacity: number, bg: string, border: string, hoverInfo = false;
  if (status === 'aktiv') {
    statusLabel = boss.rare ? t.stRare : t.activeNow.replace(' NÅ', '').replace(' NOW', '');
    statusColor = boss.rare ? GOLD : '#E0564A';
    ctaLabel = t.goFight; onTap = () => actions.enterBoss(boss.id); opacity = 1; hoverInfo = true;
    metaLine = scheduleLabel(boss, lang) + (note ? ' · ' + note : '');
    bg = 'radial-gradient(130% 90% at 80% 10%,#2a3450 0%,#161c2b 60%,#11151f 100%)'; border = '#38425a';
  } else {
    statusLabel = t.defeated + ' ✓'; statusColor = '#67D391';
    ctaLabel = t.fightAgain; onTap = () => actions.fightAgain(boss.id); opacity = .94;
    metaLine = (lang === 'en' ? 'Returns ' : 'Kommer igjen ') + whenText(boss, lang);
    bg = 'radial-gradient(130% 90% at 80% 10%,#1d2b24 0%,#141c18 60%,#0f1512 100%)'; border = '#2b3a30';
  }

  return (
    <div onClick={onTap} style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', background: bg, border: `1px solid ${border}`, cursor: 'pointer', padding: 18, marginBottom: 12, opacity }}>
      <div style={{ position: 'absolute', right: -26, bottom: -22, width: 180, opacity: status === 'aktiv' ? .9 : .5, filter: status === 'aktiv' ? 'drop-shadow(0 12px 18px rgba(0,0,0,.5))' : 'grayscale(.5) drop-shadow(0 12px 18px rgba(0,0,0,.5))' }}>
        <img src={boss.sprite} alt={boss.name} style={{ width: '100%', display: 'block', ...(boss.rare ? { animation: 'rareGlow 2s ease-in-out infinite' } : {}) }} />
      </div>
      <div style={{ position: 'relative', zIndex: 2, maxWidth: '64%' }}>
        <div style={{ display: 'inline-block', fontFamily: PS, fontSize: 7, color: statusColor, background: hexA(statusColor, .14), border: `1px solid ${hexA(statusColor, .4)}`, padding: '4px 7px', borderRadius: 5, letterSpacing: 1 }}>{statusLabel}</div>
        <div style={{ fontFamily: PS, fontSize: 13, color: '#F6EBDD', marginTop: 14, lineHeight: 1.5, textShadow: '0 2px 0 rgba(0,0,0,.5)', textTransform: 'uppercase' }}>{boss.name}</div>
        <div style={{ fontSize: 12, color: '#A8B0BF', marginTop: 10, fontWeight: 500 }}>{metaLine}</div>
        {hoverInfo && (
          <>
            <div style={{ marginTop: 14, height: 11, borderRadius: 6, background: '#0b0e16', border: '1px solid #000', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(boss.hp / (mh || 1)) * 100}%`, background: 'linear-gradient(90deg,#E0564A,#ff7a6e)', transition: 'width .5s' }} />
            </div>
            <div style={{ fontSize: 11, color: '#6C7486', marginTop: 6, fontWeight: 600 }}>{boss.hp}/{mh} {t.hpLeft}</div>
          </>
        )}
        <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, ...(status === 'aktiv'
          ? { background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A', boxShadow: '0 5px 0 #b8801f', padding: '12px 18px' }
          : { background: 'rgba(103,211,145,.14)', border: '1px solid rgba(103,211,145,.4)', color: '#67D391', padding: '11px 16px' }), fontFamily: PS, fontSize: 9, letterSpacing: 1, borderRadius: 12 }}>{ctaLabel}</div>
      </div>
    </div>
  );
}

function Thumb({ boss, size }: { boss: Boss; size: number }) {
  return (
    <div title={boss.name} style={{ width: size, height: size }}>
      <img src={boss.sprite} alt={boss.name} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }} />
    </div>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, background: '#1b2130', border: '1px solid #2b3346', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ fontFamily: PS, fontSize: 15, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#6C7486', marginTop: 6, letterSpacing: .3 }}>{label}</div>
    </div>
  );
}

function SectionLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return <div style={{ fontFamily: PS, fontSize: 8, color, letterSpacing: 1, margin: '26px 0 12px' }}>{children}</div>;
}

const hdrBtn: React.CSSProperties = { width: 40, height: 40, borderRadius: 13, background: '#1b2130', border: '1px solid #333c50', color: '#A8B0BF', cursor: 'pointer', display: 'grid', placeItems: 'center' };
const coinBlue: React.CSSProperties = { width: 18, height: 18, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#bfe0ff,#5B9BE8 60%,#2f6bb0)', boxShadow: '0 0 8px rgba(91,155,232,.5)' };

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
  );
}
