import { useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { useT, BossSprite, Avatar, initialOf, GOLD } from '../ui/common';
import { maxHpOf, scheduleLabel, statusOf, hexA, isElite } from '../game/logic';

const PS = "'Press Start 2P'";

export function BattleScreen() {
  const { state, actions } = useGame();
  const t = useT();
  const g = state.game;
  const ui = state.ui;
  const boss = g.bosses.find((b) => b.id === g.currentBossId) ?? g.bosses[0];
  const lang = g.settings.lang;

  const maxHp = maxHpOf(boss.chores);
  const hp = boss.hp;
  const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
  const defeated = hp <= 0;
  const status = statusOf(boss, g.goldenRevealed);
  const statusLabel = status === 'aktiv' ? t.stAktiv : status === 'beseiret' ? t.stBeseiret : t.stPlanlagt;
  const elite = isElite(boss);

  const activeFighter = g.fighters.find((f) => f.id === g.activeFighterId);
  const activeName = activeFighter?.name ?? '—';

  // Per-fighter damage this cycle (for rail totals + MVP).
  const dmgByFighter = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of g.fighters) {
      m[f.id] = g.log.filter((e) => e.fighterId === f.id && e.bossId === boss.id).reduce((a, e) => a + e.damage, 0);
    }
    return m;
  }, [g.fighters, g.log, boss.id]);
  const maxTotal = Math.max(0, ...Object.values(dmgByFighter));
  const mvpId = maxTotal > 0 ? g.fighters.find((f) => dmgByFighter[f.id] === maxTotal)?.id : undefined;
  const mvpName = mvpId ? g.fighters.find((f) => f.id === mvpId)?.name ?? '—' : '—';

  const sparkles = useMemo(() => makeSparkles(boss.rare), [boss.rare]);

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', maxWidth: 560, margin: '0 auto', width: '100%' }}>
      {/* header */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 10px' }}>
        <button onClick={() => actions.go('home')} style={iconBtn}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: PS, fontSize: 9, color: GOLD, letterSpacing: 1 }}>{scheduleLabel(boss, lang).toUpperCase()}</div>
        </div>
        <button onClick={actions.reset} style={{ height: 40, padding: '0 14px', borderRadius: 13, border: '1px solid rgba(244,185,66,.4)', background: 'rgba(244,185,66,.08)', color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: .5, cursor: 'pointer' }}>{t.retreat}</button>
      </div>

      {/* stage */}
      <div ref={actions.setStageRef} style={{ position: 'relative', margin: '2px 16px 0', flex: 1, minHeight: 340, borderRadius: 24, overflow: 'hidden', background: 'radial-gradient(120% 90% at 50% 15%,#26314a 0%,#141a28 55%,#0c0f18 100%)', border: '1px solid #2b3346' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(91,155,232,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(91,155,232,.10) 1px,transparent 1px)', backgroundSize: '34px 34px', backgroundPosition: 'center', maskImage: 'linear-gradient(180deg,transparent 40%,#000 100%)', WebkitMaskImage: 'linear-gradient(180deg,transparent 40%,#000 100%)' }} />
        <div style={{ position: 'absolute', top: '56%', left: '50%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,rgba(244,185,66,.22) 0%,transparent 68%)', animation: 'glowPulse 3.4s ease-in-out infinite' }} />

        {boss.rare && (
          <>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 95% at 50% 38%,rgba(244,185,66,.30) 0%,rgba(150,100,25,.12) 42%,transparent 72%)', zIndex: 2, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: '38%', left: '50%', width: 560, height: 560, margin: '-280px 0 0 -280px', background: 'conic-gradient(from 0deg,transparent 0deg,rgba(255,220,130,.16) 10deg,transparent 22deg,transparent 34deg,rgba(255,220,130,.16) 46deg,transparent 58deg,transparent 70deg,rgba(255,220,130,.16) 82deg,transparent 96deg)', borderRadius: '50%', animation: 'raySpin 30s linear infinite', zIndex: 2, pointerEvents: 'none', maskImage: 'radial-gradient(circle,#000 30%,transparent 68%)', WebkitMaskImage: 'radial-gradient(circle,#000 30%,transparent 68%)' }} />
            {sparkles.map((s, i) => <div key={i} style={s} />)}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 24, boxShadow: 'inset 0 0 70px rgba(244,185,66,.28)', zIndex: 13, pointerEvents: 'none' }} />
          </>
        )}
        {elite && !boss.rare && (
          <>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 95% at 50% 42%,rgba(224,86,74,.28) 0%,rgba(150,30,25,.12) 44%,transparent 72%)', zIndex: 2, pointerEvents: 'none', animation: 'emberPulse 2.4s ease-in-out infinite' }} />
            <div style={{ position: 'absolute', inset: 0, borderRadius: 24, boxShadow: 'inset 0 0 60px rgba(224,86,74,.30)', zIndex: 13, pointerEvents: 'none' }} />
          </>
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 118, background: 'linear-gradient(0deg,rgba(9,12,20,.97) 30%,rgba(9,12,20,.6) 70%,transparent)', zIndex: 14, pointerEvents: 'none' }} />

        {/* HP bar */}
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 15 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontFamily: PS, fontSize: 11, color: boss.rare ? '#ffe08a' : '#F6EBDD', textShadow: '0 2px 0 rgba(0,0,0,.6)', letterSpacing: .5, textTransform: 'uppercase' }}>{boss.name}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {elite && !boss.rare && <div style={eliteBadge}>{t.stElite}</div>}
              <div style={boss.rare ? rareBadge : normalBadge}>{statusLabel}</div>
            </div>
          </div>
          <div style={{ position: 'relative', height: 16, borderRadius: 8, background: '#0b0e16', border: '1.5px solid #000', boxShadow: 'inset 0 2px 4px rgba(0,0,0,.6),0 1px 0 rgba(255,255,255,.06)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: boss.rare ? 'linear-gradient(180deg,#ffe9a8,#F4B942 52%,#c8901c)' : 'linear-gradient(180deg,#ff7a6e,#E0564A 55%,#b83b31)', transition: 'width .5s cubic-bezier(.2,.8,.2,1)', borderRadius: 6 }}>
              <div style={{ position: 'absolute', top: 1, left: 3, right: 3, height: 4, background: 'rgba(255,255,255,.35)', borderRadius: 3 }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, width: 44, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent)', animation: 'barShine 2.6s linear infinite' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, fontWeight: 600 }}>
            <span style={{ color: '#6C7486' }}>{boss.trigger.note || scheduleLabel(boss, lang)}</span>
            <span style={{ fontFamily: PS, fontSize: 9, color: '#F6EBDD' }}>{hp}/{maxHp}</span>
          </div>
        </div>

        {ui.combo >= 2 && !defeated && (
          <div style={{ position: 'absolute', top: 100, right: 18, zIndex: 16, textAlign: 'right', animation: 'floatBadge 1.2s ease-in-out infinite' }}>
            <div style={{ fontFamily: PS, fontSize: 24, color: GOLD, textShadow: '0 3px 0 rgba(0,0,0,.55),0 0 14px rgba(244,185,66,.6)', lineHeight: 1 }}>{ui.combo}</div>
            <div style={{ fontFamily: PS, fontSize: 7, color: GOLD, letterSpacing: 1, marginTop: 3 }}>{t.combo}</div>
          </div>
        )}

        {/* boss sprite */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 70, top: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <div style={{ animation: 'idleBob 3.2s ease-in-out infinite', filter: 'drop-shadow(0 24px 26px rgba(0,0,0,.55))' }}>
            <BossSprite
              ref={actions.setSpriteRef}
              boss={boss}
              elite={elite}
              style={boss.frames ? { height: 340, width: 170 } : { width: 'min(58vw,224px)' }}
            />
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 86, left: '50%', transform: 'translateX(-50%)', width: 200, height: 26, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,0,0,.6),transparent 70%)', zIndex: 9 }} />

        <div ref={actions.setFlashRef} style={{ position: 'absolute', inset: 0, zIndex: 26, background: 'radial-gradient(circle at 50% 58%,#fff,rgba(255,240,210,.5) 38%,transparent 72%)', opacity: 0, pointerEvents: 'none', mixBlendMode: 'screen' }} />

        {ui.dmgNums.map((d) => (
          <div key={d.id} style={{ position: 'absolute', top: '44%', left: `${d.x}%`, transform: 'translateX(-50%)', fontFamily: PS, fontSize: d.crit ? 30 : 21, color: d.crit ? GOLD : '#fff', textShadow: `0 2px 0 #000,0 0 14px ${d.crit ? 'rgba(244,185,66,.7)' : 'rgba(0,0,0,.6)'}`, animation: 'floatDmg .95s ease-out forwards', pointerEvents: 'none', zIndex: 22, whiteSpace: 'nowrap' }}>{d.label}</div>
        ))}

        {ui.won && <VictoryOverlay mvp={mvpName} coins={ui.lastRewardTotal} elite={elite} />}
        {ui.intro && (
          <div onClick={actions.startFight} style={{ position: 'absolute', inset: 0, zIndex: 35, background: 'rgba(7,9,13,.72)', backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 20 }}>
            <div style={{ fontFamily: PS, fontSize: 9, color: '#E0564A', letterSpacing: 2, animation: 'victoryPop .4s ease-out both' }}>{t.introAppears}</div>
            <div style={{ fontFamily: PS, fontSize: 20, color: '#F6EBDD', textShadow: '0 3px 0 rgba(0,0,0,.6),0 0 20px rgba(244,185,66,.4)', marginTop: 18, textAlign: 'center', lineHeight: 1.5, textTransform: 'uppercase', animation: 'introSlam .7s cubic-bezier(.2,.9,.2,1) both' }}>{boss.name}</div>
            <div style={{ marginTop: 22, fontSize: 12, color: '#A8B0BF', letterSpacing: 1, animation: 'floatBadge 1.4s ease-in-out infinite' }}>{t.tapStart}</div>
          </div>
        )}
      </div>

      {/* party rail */}
      <div style={{ flex: 'none', padding: '14px 18px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: PS, fontSize: 8, color: '#6C7486', letterSpacing: 1 }}>{t.railTeam}</span>
          <span style={{ fontSize: 10, color: '#5a637a', fontWeight: 500 }}>{t.tapPick}</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#2b3346,transparent)' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {g.fighters.map((f) => {
            const sel = g.activeFighterId === f.id;
            const pinging = ui.ping?.fighterId === f.id;
            return (
              <button key={f.id} onClick={() => actions.selectFighter(f.id)} style={railBtn}>
                <div style={{ position: 'relative', width: 48, height: 48, borderRadius: 14, background: '#2C3548', border: `2px solid ${f.color}`, display: 'grid', placeItems: 'center', fontFamily: PS, fontSize: 13, color: f.color }}>
                  {sel && <div style={{ position: 'absolute', inset: -3, borderRadius: 15, background: hexA(f.color, .16), boxShadow: `0 0 0 2px ${f.color},0 0 18px ${hexA(f.color, .55)}` }} />}
                  <Avatar fighter={f} radius={12} />
                  {!f.avatar && <span style={{ position: 'relative', zIndex: 1 }}>{initialOf(f.name)}</span>}
                  {pinging && <div style={{ position: 'absolute', inset: -2, borderRadius: 14, border: `2px solid ${f.color}`, animation: 'casterPing .6s ease-out', zIndex: 2 }} />}
                </div>
                <div style={{ fontSize: 11, color: '#A8B0BF', fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontFamily: PS, fontSize: 8, color: f.color }}>{dmgByFighter[f.id] ?? 0}</div>
              </button>
            );
          })}
          {g.fighters.length === 0 && (
            <button onClick={actions.openPartyManager} style={{ ...railBtn, color: '#6C7486', fontSize: 12, fontWeight: 600 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, border: '1px dashed #38425a', display: 'grid', placeItems: 'center', fontSize: 22 }}>＋</div>
              {t.addFighter.replace('+ ', '')}
            </button>
          )}
        </div>
      </div>

      {/* attacks */}
      <div style={{ flex: 'none', padding: '8px 16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: PS, fontSize: 8, color: '#6C7486', letterSpacing: 1 }}>{t.chooseAttack}</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#2b3346,transparent)' }} />
          <span style={{ fontSize: 11, color: '#A8B0BF', fontWeight: 600, whiteSpace: 'nowrap' }}><b style={{ color: GOLD }}>{activeName}</b>{t.turnSuffix}</span>
          <button onClick={() => actions.openEditChores()} title={t.editChoresTitle} style={{ flex: 'none', width: 30, height: 30, borderRadius: 9, background: '#1b2130', border: '1px solid #333c50', color: '#A8B0BF', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><EditIcon size={15} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {boss.chores.map((c, i) => {
            const dmg = Number(c.damage) || 0;
            const crit = dmg >= 28;
            const tier = crit ? t.tierCrit : dmg <= 14 ? t.tierLight : t.tierMed;
            const isUsed = !c.repeatable && boss.usedChores.includes(c.id);
            let badge = '', badgeColor = GOLD;
            if (isUsed) { badge = t.badgeDone; badgeColor = '#67D391'; }
            else if (c.repeatable) { badge = t.badgeRepeat; badgeColor = '#5B9BE8'; }
            else if (crit) { badge = t.badgeCrit; badgeColor = GOLD; }
            const disabled = isUsed || defeated;
            return (
              <button key={c.id} onClick={() => actions.doAttack(i)} disabled={disabled}
                style={{ display: 'flex', alignItems: 'stretch', padding: 0, border: `1px solid ${isUsed ? '#222a3c' : crit ? 'rgba(244,185,66,.45)' : '#333c50'}`, borderRadius: 14, background: isUsed ? '#141a26' : crit ? 'linear-gradient(180deg,#241f14,#1b2130)' : '#1b2130', overflow: 'hidden', cursor: disabled ? 'default' : 'pointer', textAlign: 'left', position: 'relative', opacity: isUsed ? .5 : 1 }}>
                {badge && <div style={{ position: 'absolute', top: 6, right: 8, fontFamily: PS, fontSize: 6, color: badgeColor, letterSpacing: 1 }}>{badge}</div>}
                <div style={{ width: 5, background: isUsed ? '#2b3346' : crit ? GOLD : '#5B6B85' }} />
                <div style={{ flex: 1, padding: '11px 12px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#F6EBDD', lineHeight: 1.15 }}>{c.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: .5, color: crit ? GOLD : '#6C7486' }}>{tier}</span>
                    <span style={{ fontFamily: PS, fontSize: 9, color: crit ? GOLD : '#ff8f85' }}>-{dmg}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VictoryOverlay({ mvp, coins, elite }: { mvp: string; coins: number; elite: boolean }) {
  const { actions } = useGame();
  const { confetti } = useGame();
  const t = useT();
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'radial-gradient(circle at 50% 42%,rgba(103,211,145,.18),rgba(9,11,16,.82) 70%)', backdropFilter: 'blur(2px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      {confetti.map((c) => (
        <div key={c.id} style={{ position: 'absolute', top: -20, left: `${c.left}%`, width: c.w, height: c.h, background: c.color, borderRadius: 2, animation: `confetti ${c.dur}s ${c.delay}s linear infinite`, zIndex: 1 }} />
      ))}
      <div style={{ fontFamily: PS, fontSize: 12, color: '#67D391', letterSpacing: 2, animation: 'victoryPop .5s ease-out both' }}>{t.bossDefeated}</div>
      <div style={{ fontFamily: PS, fontSize: 34, color: GOLD, textShadow: '0 4px 0 rgba(0,0,0,.6),0 0 22px rgba(244,185,66,.55)', marginTop: 16, textAlign: 'center', animation: 'victoryPop .6s .08s ease-out both' }}>{t.victory}</div>
      {elite && <div style={{ fontFamily: PS, fontSize: 8, color: '#E0564A', letterSpacing: 1, marginTop: 12, textAlign: 'center', animation: 'victoryPop .6s .14s ease-out both' }}>{t.eliteBonus}</div>}
      <div style={{ marginTop: 22, background: 'rgba(255,255,255,.05)', border: '1px solid #333c50', borderRadius: 16, padding: '16px 24px', display: 'flex', gap: 28, animation: 'victoryPop .6s .18s ease-out both' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontFamily: PS, fontSize: 16, color: GOLD }}>+{coins}</div><div style={{ fontSize: 10, color: '#6C7486', marginTop: 5, letterSpacing: .5 }}>{t.coinsLabel}</div></div>
        <div style={{ width: 1, background: '#333c50' }} />
        <div style={{ textAlign: 'center' }}><div style={{ fontFamily: PS, fontSize: 16, color: GOLD }}>{mvp}</div><div style={{ fontSize: 10, color: '#6C7486', marginTop: 5, letterSpacing: .5 }}>{t.mvp}</div></div>
      </div>
      <button onClick={actions.reset} style={{ marginTop: 24, padding: '15px 32px', borderRadius: 14, border: 'none', background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A', fontFamily: PS, fontSize: 10, letterSpacing: 1, cursor: 'pointer', boxShadow: '0 6px 0 #b8801f,0 10px 18px rgba(0,0,0,.4)', animation: 'victoryPop .6s .28s ease-out both' }}>{t.fightAgainBtn}</button>
    </div>
  );
}

function makeSparkles(on: boolean): React.CSSProperties[] {
  if (!on) return [];
  return Array.from({ length: 18 }, () => {
    const left = Math.round(Math.random() * 100);
    const top = Math.round(12 + Math.random() * 74);
    const sz = 4 + Math.round(Math.random() * 7);
    const dur = (1.8 + Math.random() * 2.4).toFixed(2);
    const del = (Math.random() * 3).toFixed(2);
    return {
      position: 'absolute', left: `${left}%`, top: `${top}%`, width: sz, height: sz,
      background: '#ffe08a', boxShadow: '0 0 8px 2px rgba(255,215,120,.85)',
      animation: `twinkle ${dur}s ease-in-out ${del}s infinite`, zIndex: 8, pointerEvents: 'none',
    } as React.CSSProperties;
  });
}

const iconBtn: React.CSSProperties = { width: 40, height: 40, borderRadius: 13, border: '1px solid #333c50', background: 'rgba(255,255,255,.04)', color: '#A8B0BF', fontSize: 20, cursor: 'pointer', display: 'grid', placeItems: 'center' };
const railBtn: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 };
const rareBadge: React.CSSProperties = { fontFamily: PS, fontSize: 8, color: GOLD, background: 'rgba(244,185,66,.16)', border: '1px solid rgba(244,185,66,.55)', padding: '3px 6px', borderRadius: 5, boxShadow: '0 0 10px rgba(244,185,66,.4)' };
const normalBadge: React.CSSProperties = { fontFamily: PS, fontSize: 8, color: '#E0564A', background: 'rgba(224,86,74,.14)', border: '1px solid rgba(224,86,74,.4)', padding: '3px 6px', borderRadius: 5 };
const eliteBadge: React.CSSProperties = { fontFamily: PS, fontSize: 8, color: '#ffd0c8', background: 'rgba(224,86,74,.28)', border: '1px solid rgba(224,86,74,.7)', padding: '3px 6px', borderRadius: 5, boxShadow: '0 0 10px rgba(224,86,74,.45)' };

export function EditIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
  );
}
