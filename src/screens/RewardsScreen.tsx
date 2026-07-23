import { useGame } from '../store/GameContext';
import { useT, Avatar, initialOf, GOLD } from '../ui/common';
import { hexA } from '../game/logic';
import { REWARDS_PERSONAL, REWARDS_GROUP } from '../game/seed';
import type { RewardDef } from '../game/types';

const PS = "'Press Start 2P'";

export function RewardsScreen() {
  const { state, actions } = useGame();
  const t = useT();
  const g = state.game;
  const active = g.fighters.find((f) => f.id === g.activeFighterId);
  const myCoins = active?.coins ?? 0;
  const colorByName = new Map(g.fighters.map((f) => [f.name, f.color]));

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', width: '100%', padding: '24px 18px 20px' }}>
      <div style={{ fontFamily: PS, fontSize: 15, color: GOLD, lineHeight: 1.4 }}>{t.rewards}</div>
      <div style={{ fontSize: 13, color: '#6C7486', marginTop: 8, fontWeight: 500 }}>{t.rewardsSub}</div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, background: 'radial-gradient(130% 120% at 15% 10%,#14202a,#1b2130 70%)', border: '1px solid rgba(91,155,232,.35)', borderRadius: 18, padding: '18px 20px' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#bfe0ff,#5B9BE8 55%,#2f6bb0)', boxShadow: '0 0 16px rgba(91,155,232,.5),inset 0 -3px 4px rgba(0,0,0,.3)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: PS, fontSize: 22, color: '#8fc0ff', textShadow: '0 2px 0 rgba(0,0,0,.4)' }}>{g.pool}</div>
          <div style={{ fontSize: 11, color: '#A8B0BF', marginTop: 5, fontWeight: 500 }}>{t.inPool}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: PS, fontSize: 13, color: '#F6EBDD' }}>{g.victories}</div>
          <div style={{ fontSize: 10, color: '#6C7486', marginTop: 4 }}>{t.wins}</div>
        </div>
      </div>

      {g.fighters.length > 0 && (
        <>
          <div style={label}>{t.myCoins}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {g.fighters.map((f) => {
              const sel = g.activeFighterId === f.id;
              return (
                <button key={f.id} onClick={() => actions.selectFighter(f.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{ position: 'relative', width: 46, height: 46, borderRadius: 14, background: '#2C3548', border: `2px solid ${f.color}`, display: 'grid', placeItems: 'center', fontFamily: PS, fontSize: 13, color: f.color }}>
                    {sel && <div style={{ position: 'absolute', inset: -3, borderRadius: 15, boxShadow: `0 0 0 2px ${f.color},0 0 14px ${hexA(f.color, .5)}` }} />}
                    <Avatar fighter={f} radius={12} />{!f.avatar && <span style={{ position: 'relative', zIndex: 1 }}>{initialOf(f.name)}</span>}
                  </div>
                  <div style={{ fontFamily: PS, fontSize: 8, color: GOLD }}>{f.coins}</div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, background: '#1b2130', border: '1px solid #2b3346', borderRadius: 16, padding: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: PS, fontSize: 20, color: GOLD }}>{myCoins}</div>
              <div style={{ fontSize: 11, color: '#A8B0BF', marginTop: 5, fontWeight: 500 }}>{t.coinsOf.replace('{n}', active?.name ?? '—')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => actions.transfer(10)} disabled={myCoins <= 0} style={{ padding: '11px 12px', border: '1px solid rgba(91,155,232,.5)', borderRadius: 11, background: 'rgba(91,155,232,.16)', color: '#8fc0ff', fontFamily: PS, fontSize: 8, letterSpacing: .5, cursor: 'pointer' }}>+10 →</button>
              <button onClick={() => actions.transfer('all')} disabled={myCoins <= 0} style={{ padding: '11px 12px', border: '1px solid #333c50', borderRadius: 11, background: '#232c3e', color: '#A8B0BF', fontFamily: PS, fontSize: 8, letterSpacing: .5, cursor: 'pointer' }}>ALT →</button>
            </div>
          </div>
        </>
      )}

      <div style={label}>{t.myRewards}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {REWARDS_PERSONAL.map((r) => <RewardCard key={r.id} r={r} balance={myCoins} kind="personal" />)}
      </div>

      <div style={label}>{t.groupRewards}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {REWARDS_GROUP.map((r) => <RewardCard key={r.id} r={r} balance={g.pool} kind="group" />)}
      </div>

      {g.redemptions.length > 0 && (
        <>
          <div style={label}>{t.recentRedeemed}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {g.redemptions.map((e) => (
              <div key={e.vid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b28', border: '1px solid #262e40', borderRadius: 13, padding: '13px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: colorByName.get(e.who) || '#8fc0ff' }} />
                  <div>
                    <div style={{ fontSize: 14, color: '#F6EBDD', fontWeight: 600 }}>{e.title}</div>
                    <div style={{ fontSize: 11, color: '#6C7486', marginTop: 2 }}>{e.who}</div>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: '#6C7486' }}>−{e.cost} · {e.at}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RewardCard({ r, balance, kind }: { r: RewardDef; balance: number; kind: 'personal' | 'group' }) {
  const { actions } = useGame();
  const t = useT();
  const afford = balance >= r.cost;
  const group = kind === 'group';
  const coinBg = group
    ? 'radial-gradient(circle at 35% 30%,#bfe0ff,#5B9BE8 60%,#2f6bb0)'
    : 'radial-gradient(circle at 35% 30%,#ffe08a,#F4B942 60%,#b8801f)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: group ? '#161f2b' : '#1b2130', border: `1px solid ${group ? 'rgba(91,155,232,.25)' : '#2b3346'}`, borderRadius: 16, padding: 14, opacity: afford ? 1 : .6 }}>
      <div style={{ width: 46, height: 46, borderRadius: 13, background: group ? '#101722' : '#141a26', border: `1px solid ${group ? 'rgba(91,155,232,.3)' : '#2b3346'}`, display: 'grid', placeItems: 'center', fontSize: 22 }}>{r.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F6EBDD', lineHeight: 1.2 }}>{r.title}</div>
        <div style={{ fontSize: 11, color: '#6C7486', marginTop: 4, fontWeight: 500 }}>{r.desc}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <div style={{ width: 13, height: 13, borderRadius: '50%', background: coinBg }} />
          <span style={{ fontFamily: PS, fontSize: 10, color: group ? '#8fc0ff' : GOLD }}>{r.cost}</span>
        </div>
      </div>
      <button onClick={() => (group ? actions.redeemGroup(r) : actions.redeemPersonal(r))} disabled={!afford}
        style={{ flex: 'none', padding: '11px 14px', border: 'none', borderRadius: 12, background: afford ? 'linear-gradient(180deg,#ffd873,#F4B942)' : '#232c3e', color: afford ? '#20160A' : '#5a637a', fontFamily: PS, fontSize: 8, letterSpacing: .5, cursor: afford ? 'pointer' : 'default', boxShadow: afford ? '0 4px 0 #b8801f' : 'none' }}>{afford ? t.redeem : t.tooPricey}</button>
    </div>
  );
}

const label: React.CSSProperties = { fontFamily: PS, fontSize: 8, color: '#6C7486', letterSpacing: 1, margin: '26px 0 12px' };
