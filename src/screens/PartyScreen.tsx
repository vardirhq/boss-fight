import { useGame } from '../store/GameContext';
import { useT, Avatar, initialOf, GOLD } from '../ui/common';
import { EditIcon } from './BattleScreen';
import { levelInfo } from '../game/logic';

const PS = "'Press Start 2P'";

export function PartyScreen() {
  const { state, actions } = useGame();
  const t = useT();
  const g = state.game;
  const boss = g.bosses.find((b) => b.id === g.currentBossId) ?? g.bosses[0];

  const dmgByFighter: Record<string, number> = {};
  const hitsByFighter: Record<string, number> = {};
  for (const f of g.fighters) {
    const entries = g.log.filter((e) => e.fighterId === f.id && e.bossId === boss.id);
    dmgByFighter[f.id] = entries.reduce((a, e) => a + e.damage, 0);
    hitsByFighter[f.id] = entries.length;
  }
  const maxTotal = Math.max(0, ...Object.values(dmgByFighter));
  const mvpId = maxTotal > 0 ? g.fighters.find((f) => dmgByFighter[f.id] === maxTotal)?.id : undefined;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', width: '100%', padding: '24px 18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: PS, fontSize: 15, color: GOLD, lineHeight: 1.4 }}>{t.team}</div>
          <div style={{ fontSize: 13, color: '#6C7486', marginTop: 8, fontWeight: 500 }}>Madsen-husholdningen · {t.teamSub.replace('{n}', String(g.fighters.length))}</div>
        </div>
        <button onClick={actions.openPartyManager} title={t.partyMgrTitle} style={{ flex: 'none', width: 40, height: 40, borderRadius: 13, background: '#1b2130', border: '1px solid #333c50', color: '#A8B0BF', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><EditIcon size={16} /></button>
      </div>

      {g.fighters.length === 0 ? (
        <div style={{ marginTop: 36, textAlign: 'center', padding: '40px 24px', border: '1px dashed #333c50', borderRadius: 18 }}>
          <div style={{ fontSize: 40 }}>🧑‍🤝‍🧑</div>
          <div style={{ fontSize: 14, color: '#A8B0BF', fontWeight: 600, marginTop: 14 }}>{t.noFighters}</div>
          <div style={{ fontSize: 12, color: '#6C7486', marginTop: 8, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: t.noFightersSub }} />
          <button onClick={actions.openPartyManager} style={goldBtn}>{t.addFightersBtn}</button>
        </div>
      ) : (
        <>
          <div style={sectionLabel}>{t.thisBattle.replace('{boss}', boss.name)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {g.fighters.map((f) => {
              const li = levelInfo(f.careerXp);
              const isMvp = f.id === mvpId && maxTotal > 0;
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#1b2130', border: '1px solid #2b3346', borderRadius: 16, padding: 14 }}>
                  <div style={{ position: 'relative', width: 50, height: 50, borderRadius: 13, background: '#2C3548', border: `2px solid ${f.color}`, display: 'grid', placeItems: 'center', fontFamily: PS, fontSize: 14, color: f.color, overflow: 'hidden' }}>
                    <Avatar fighter={f} />{!f.avatar && <span>{initialOf(f.name)}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#F6EBDD' }}>{f.name}</span>
                      <span style={{ fontFamily: PS, fontSize: 6, color: f.color, border: `1px solid ${f.color}`, padding: '3px 5px', borderRadius: 4, letterSpacing: .5 }}>{t.level} {li.level}</span>
                      {isMvp && <span style={{ fontFamily: PS, fontSize: 6, color: '#20160A', background: GOLD, padding: '3px 5px', borderRadius: 4, letterSpacing: .5 }}>MVP</span>}
                    </div>
                    <div style={{ fontSize: 11, color: f.color, marginTop: 4, fontWeight: 600 }}>{li.title}</div>
                    <div style={{ marginTop: 8, height: 7, borderRadius: 5, background: '#0b0e16', border: '1px solid #000', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${li.pct}%`, background: `linear-gradient(90deg,${f.color},#ffe08a)`, transition: 'width .5s' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#6C7486', marginTop: 5, fontWeight: 500 }}>{t.statLine.replace('{h}', String(hitsByFighter[f.id] ?? 0)).replace('{x}', `${li.into} / ${li.per} XP`)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: PS, fontSize: 12, color: f.color }}>{dmgByFighter[f.id] ?? 0}</div>
                    <div style={{ fontSize: 10, color: '#6C7486', marginTop: 5 }}>{t.dmgNow}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <button onClick={actions.replayOnboarding} style={{ marginTop: 28, width: '100%', background: 'none', border: '1px solid #2b3346', borderRadius: 13, padding: 14, color: '#6C7486', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t.replayIntro}</button>
    </div>
  );
}

const sectionLabel: React.CSSProperties = { fontFamily: PS, fontSize: 8, color: '#6C7486', letterSpacing: 1, margin: '26px 0 12px' };
const goldBtn: React.CSSProperties = { marginTop: 18, padding: '12px 22px', border: 'none', borderRadius: 12, background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A', fontFamily: PS, fontSize: 9, letterSpacing: .5, cursor: 'pointer', boxShadow: '0 4px 0 #b8801f' };
