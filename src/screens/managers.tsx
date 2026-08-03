import { useGame } from '../store/GameContext';
import { useT, Avatar, initialOf, GOLD } from '../ui/common';
import { maxHpOf, bossFilter } from '../game/logic';
import { FIGHTER_COLORS } from '../game/seed';
import { DAY_SHORT } from '../game/i18n';
import type { TriggerType } from '../game/types';
import type { Fighter } from '../game/types';
import { useOnline } from '../online/OnlineContext';
import {
  createFighterPairing,
  inviteAdultFighter,
  resetChildPin,
  setupChildFighter,
  suspendFighterAccess,
  unlinkFighterAccount,
  updateFighterAccess,
} from '../online/api';
import { serverSyncToGameState } from '../online/gameSync';

const PS = "'Press Start 2P'";

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 78, background: '#0b0e16', display: 'flex', flexDirection: 'column' };
const modalHeader: React.CSSProperties = { flex: 'none', padding: 'calc(20px + env(safe-area-inset-top)) 18px 14px', borderBottom: '1px solid #222a3c', display: 'flex', alignItems: 'center', gap: 12 };
const doneBtn: React.CSSProperties = { flex: 'none', padding: '12px 20px', border: 'none', borderRadius: 13, background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A', fontFamily: PS, fontSize: 9, letterSpacing: 1, cursor: 'pointer', boxShadow: '0 4px 0 #b8801f' };
const textInput: React.CSSProperties = { flex: 1, minWidth: 0, background: '#0f1420', border: '1px solid #333c50', borderRadius: 10, padding: '11px 12px', color: '#F6EBDD', fontSize: 15, fontWeight: 700, outline: 'none' };
const delBtn: React.CSSProperties = { flex: 'none', width: 38, height: 38, borderRadius: 10, background: '#241518', border: '1px solid rgba(224,86,74,.4)', color: '#E0564A', fontSize: 20, lineHeight: 1, cursor: 'pointer', display: 'grid', placeItems: 'center' };
const dashedAdd: React.CSSProperties = { border: '1px dashed #38425a', background: 'none', borderRadius: 14, padding: 15, color: '#A8B0BF', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const sleepBtn: React.CSSProperties = { flex: 'none', padding: '8px 14px', borderRadius: 10, background: '#232c3e', border: '1px solid #333c50', color: '#A8B0BF', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const wakeBtn: React.CSSProperties = { flex: 'none', padding: '8px 14px', borderRadius: 10, background: 'rgba(103,211,145,.14)', border: '1px solid rgba(103,211,145,.45)', color: '#67D391', fontSize: 12, fontWeight: 700, cursor: 'pointer' };

function seg(active: boolean): React.CSSProperties {
  return active
    ? { flex: 1, padding: '9px 4px', borderRadius: 9, border: `1px solid ${GOLD}`, background: 'rgba(244,185,66,.16)', color: GOLD, fontSize: 11, fontWeight: 700, cursor: 'pointer' }
    : { flex: 1, padding: '9px 4px', borderRadius: 9, border: '1px solid #333c50', background: '#0f1420', color: '#8b93a5', fontSize: 11, fontWeight: 600, cursor: 'pointer' };
}
function chip(active: boolean): React.CSSProperties {
  return active
    ? { flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #5B9BE8', background: 'rgba(91,155,232,.18)', color: '#8fc0ff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }
    : { flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #333c50', background: '#0f1420', color: '#8b93a5', fontSize: 10, fontWeight: 600, cursor: 'pointer' };
}

export function BossManager() {
  const { state, actions } = useGame();
  const t = useT();
  const g = state.game;
  const shortDays = DAY_SHORT[g.settings.lang];

  return (
    <div style={overlay}>
      <div style={modalHeader}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: PS, fontSize: 13, color: GOLD }}>{t.bossMgrTitle}</div>
          <div style={{ fontSize: 12, color: '#6C7486', marginTop: 8, fontWeight: 500 }}>{t.bossMgrSub}</div>
        </div>
        <button onClick={actions.closeBossManager} style={doneBtn}>{t.done}</button>
      </div>
      <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {g.bosses.map((b) => {
          const tr = b.trigger;
          return (
            <div key={b.id} style={{ background: '#1b2130', border: '1px solid #2b3346', borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => actions.cycleSprite(b.id)} title="Bytt bilde" style={{ flex: 'none', width: 52, height: 52, borderRadius: 13, background: '#0f1420', border: '1px solid #333c50', overflow: 'hidden', cursor: 'pointer', padding: 3, opacity: b.dormant ? .55 : 1 }}>
                  <img src={b.sprite} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'contain', ...(bossFilter(b) ? { filter: bossFilter(b) } : {}) }} />
                </button>
                <input value={b.name} onChange={(e) => actions.editBoss(b.id, { name: e.target.value })} placeholder={t.bossNamePh} style={textInput} />
                <button onClick={() => actions.deleteBoss(b.id)} style={delBtn}>×</button>
              </div>
              <div style={{ fontSize: 10, color: '#6C7486', fontWeight: 600, letterSpacing: .5, margin: '14px 0 8px' }}>{t.appearsWhen}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['alltid', 'daglig', 'ukentlig', 'månedlig'] as TriggerType[]).map((tp) => (
                  <button key={tp} onClick={() => actions.setTrigger(b.id, { type: tp })} style={seg(tr.type === tp)}>
                    {tp === 'alltid' ? t.schedAlways : tp === 'daglig' ? t.schedDaily : tp === 'ukentlig' ? t.schedWeekly : t.schedMonthly}
                  </button>
                ))}
              </div>
              {tr.type === 'ukentlig' && (
                <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                  {shortDays.map((nm, idx) => (
                    <button key={idx} onClick={() => actions.setTrigger(b.id, { day: idx })} style={chip((tr.day ?? 0) === idx)}>{nm}</button>
                  ))}
                </div>
              )}
              {tr.type === 'månedlig' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, background: '#0f1420', border: '1px solid #333c50', borderRadius: 10, padding: '9px 12px', width: 'max-content' }}>
                  <span style={{ fontSize: 11, color: '#6C7486', fontWeight: 600 }}>{t.dayOfMonth}</span>
                  <input value={tr.date ?? 1} inputMode="numeric" onChange={(e) => actions.setTrigger(b.id, { date: Math.min(28, Math.max(1, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 1)) })} style={{ width: 34, background: 'none', border: 'none', color: '#8fc0ff', fontFamily: PS, fontSize: 11, outline: 'none', textAlign: 'center' }} />
                </div>
              )}
              <input value={tr.note ?? ''} onChange={(e) => actions.setTrigger(b.id, { note: e.target.value })} placeholder={t.notePh} style={{ marginTop: 10, width: '100%', background: '#0f1420', border: '1px solid #333c50', borderRadius: 10, padding: '10px 12px', color: '#A8B0BF', fontSize: 13, outline: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: b.dormant ? '#8b93a5' : '#67D391' }}>
                  {b.dormant ? t.mgrAsleep : t.mgrActive}
                  {b.dormant && b.unlockAt > 0 && <span style={{ color: '#6C7486', fontWeight: 500 }}> · {t.mgrUnlockAt.replace('{v}', String(b.unlockAt))}</span>}
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={() => actions.toggleDormant(b.id)} style={b.dormant ? wakeBtn : sleepBtn}>{b.dormant ? t.mgrWake : t.mgrSleep}</button>
              </div>
              <button onClick={() => actions.openEditChores(b.id)} style={{ marginTop: 10, width: '100%', background: '#232c3e', border: '1px solid #333c50', borderRadius: 10, padding: 11, color: '#F6EBDD', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t.editChoresBtn.replace('{n}', String(b.chores.length))}</button>
            </div>
          );
        })}
        <button onClick={actions.addBoss} style={dashedAdd}>{t.addBoss}</button>
      </div>
    </div>
  );
}

export function ChoreEditor() {
  const { state, actions } = useGame();
  const t = useT();
  const g = state.game;
  const bossId = state.ui.editBossId ?? g.currentBossId;
  const boss = g.bosses.find((b) => b.id === bossId);
  if (!boss) return null;
  const totalHp = maxHpOf(boss.chores);

  return (
    <div style={{ ...overlay, zIndex: 85 }}>
      <div style={{ flex: 'none', padding: 'calc(20px + env(safe-area-inset-top)) 18px 14px', borderBottom: '1px solid #222a3c' }}>
        <div style={{ fontFamily: PS, fontSize: 13, color: GOLD }}>{t.editChoresTitle}</div>
        <div style={{ fontSize: 12, color: '#6C7486', marginTop: 8, fontWeight: 500 }}>{t.editChoresSub.replace('{boss}', boss.name)}</div>
      </div>
      <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {boss.chores.map((c, i) => (
          <div key={c.id} style={{ background: '#1b2130', border: '1px solid #2b3346', borderRadius: 16, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input value={c.title} onChange={(e) => actions.editChore(i, { title: e.target.value })} placeholder={t.chorePlaceholder} style={{ ...textInput, fontSize: 14, fontWeight: 600 }} />
              <button onClick={() => actions.deleteChore(i)} style={delBtn}>×</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0f1420', border: '1px solid #333c50', borderRadius: 10, padding: '9px 12px' }}>
                <span style={{ fontSize: 11, color: '#6C7486', fontWeight: 600 }}>{t.dmgWord}</span>
                <input value={c.damage} inputMode="numeric" onChange={(e) => actions.editChore(i, { damage: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0 })} style={{ width: 42, background: 'none', border: 'none', color: '#ff8f85', fontFamily: PS, fontSize: 11, outline: 'none', textAlign: 'center' }} />
              </div>
              <button onClick={() => actions.editChore(i, { repeatable: !c.repeatable })} style={{ flex: 1, background: c.repeatable ? 'rgba(91,155,232,.16)' : '#232c3e', border: `1px solid ${c.repeatable ? 'rgba(91,155,232,.5)' : '#333c50'}`, borderRadius: 10, padding: 11, color: c.repeatable ? '#5B9BE8' : '#8b93a5', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{c.repeatable ? t.repMulti : t.repOnce}</button>
            </div>
          </div>
        ))}
        <button onClick={actions.addChore} style={dashedAdd}>{t.addChore}</button>
      </div>
      <div style={{ flex: 'none', padding: '14px 18px calc(16px + env(safe-area-inset-bottom))', borderTop: '1px solid #222a3c', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#6C7486', fontWeight: 500 }}>{t.bossHpSum}</div>
          <div style={{ fontFamily: PS, fontSize: 16, color: '#E0564A', marginTop: 6 }}>{totalHp} {t.hpWord}</div>
        </div>
        <button onClick={actions.finishEditChores} style={{ ...doneBtn, padding: '15px 30px', fontSize: 10, boxShadow: '0 5px 0 #b8801f' }}>{t.done}</button>
      </div>
    </div>
  );
}

/** Shared fighter editor cards, used by the party manager and onboarding setup. */
export function FighterRows() {
  const { state, actions } = useGame();
  const t = useT();
  const g = state.game;
  return (
    <>
      {g.fighters.map((f) => (
        <div key={f.id} style={{ background: '#1b2130', border: '1px solid #2b3346', borderRadius: 16, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', flex: 'none', width: 46, height: 46, borderRadius: 13, background: '#2C3548', border: `2px solid ${f.color}`, display: 'grid', placeItems: 'center', fontFamily: PS, fontSize: 14, color: f.color, overflow: 'hidden' }}>
              <Avatar fighter={f} />{!f.avatar && <span>{initialOf(f.name)}</span>}
            </div>
            <input value={f.name} onChange={(e) => actions.editFighter(f.id, { name: e.target.value })} placeholder={t.namePh} style={textInput} />
            <button onClick={() => actions.deleteFighter(f.id)} style={delBtn}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <label style={{ flex: 1, textAlign: 'center', background: '#232c3e', border: '1px solid #333c50', borderRadius: 10, padding: 10, color: '#F6EBDD', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {t.uploadPhoto}
              <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) actions.setAvatarFile(f.id, file); }} style={{ display: 'none' }} />
            </label>
            {f.avatar && <button onClick={() => actions.clearAvatar(f.id)} style={{ flex: 'none', padding: '10px 14px', background: '#241518', border: '1px solid rgba(224,86,74,.4)', borderRadius: 10, color: '#E0564A', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t.removeWord}</button>}
          </div>
          <div style={{ fontSize: 10, color: '#6C7486', fontWeight: 600, letterSpacing: .5, margin: '14px 0 8px' }}>{t.colorWord}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FIGHTER_COLORS.map((c) => (
              <button key={c} onClick={() => actions.editFighter(f.id, { color: c })} style={{ width: 28, height: 28, borderRadius: 9, background: c, cursor: 'pointer', border: `2px solid ${f.color === c ? '#F6EBDD' : 'transparent'}` }} />
            ))}
          </div>
          <FighterOnlineControls fighter={f} />
        </div>
      ))}
      <button onClick={actions.addFighter} style={dashedAdd}>{t.addFighter}</button>
    </>
  );
}

function FighterOnlineControls({ fighter }: { fighter: Fighter }) {
  const online = useOnline();
  const { state: gameState, actions: gameActions } = useGame();
  const connected = Boolean(online.state.sessionToken && online.state.householdId && online.state.configurationConnectedAt);
  const mayManage = online.state.role === 'owner' || online.state.role === 'parent';
  if (!connected || !mayManage) return null;
  const en = gameState.game.settings.lang === 'en';
  const token = online.state.sessionToken!;
  const householdId = online.state.householdId!;
  const serverBacked = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fighter.id);

  if (!serverBacked) {
    return <div style={{ marginTop: 12, color: '#F4B942', fontSize: 10 }}>{en ? 'Waiting for server sync…' : 'Venter på serversynk…'}</div>;
  }

  const refresh = async () => {
    const sync = await online.actions.syncNow();
    if (sync) gameActions.replaceGame(serverSyncToGameState(sync, gameState.game));
  };
  const setupChild = async () => {
    const pin = window.prompt(en ? `Choose a PIN for ${fighter.name}` : `Velg PIN for ${fighter.name}`)?.trim();
    if (!pin || pin.length < 4) return;
    try {
      await setupChildFighter(token, householdId, fighter.id, pin);
      const pairing = await createFighterPairing(token, householdId, fighter.id);
      window.alert(en ? `Pairing code for ${fighter.name}: ${pairing.code}` : `Paringskode for ${fighter.name}: ${pairing.code}`);
      await refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };
  const inviteAdult = async () => {
    const email = window.prompt(en ? `Email address for ${fighter.name}` : `E-postadresse for ${fighter.name}`)?.trim();
    if (!email) return;
    try {
      const invite = await inviteAdultFighter(token, householdId, fighter.id, email);
      window.alert(en ? `Invitation token: ${invite.token}` : `Invitasjonskode: ${invite.token}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };
  const pairChild = async () => {
    try {
      const pairing = await createFighterPairing(token, householdId, fighter.id);
      window.alert(en ? `Pairing code for ${fighter.name}: ${pairing.code}` : `Paringskode for ${fighter.name}: ${pairing.code}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };
  const resetPin = async () => {
    const pin = window.prompt(en ? `New PIN for ${fighter.name}` : `Ny PIN for ${fighter.name}`)?.trim();
    if (!pin || pin.length < 4) return;
    try {
      await resetChildPin(token, householdId, fighter.id, pin);
      window.alert(en ? 'PIN updated.' : 'PIN-koden er oppdatert.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };
  const toggleAccess = async () => {
    try {
      await updateFighterAccess(token, householdId, fighter.id, !fighter.requireOwnDevice);
      await refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };
  const suspendAccess = async () => {
    const restoring = fighter.accountStatus === 'suspended';
    if (!window.confirm(restoring
      ? (en ? `Restore ${fighter.name}'s access?` : `Vil du gjenopprette tilgangen til ${fighter.name}?`)
      : (en ? `Suspend ${fighter.name}'s access on all devices?` : `Vil du sperre tilgangen til ${fighter.name} på alle enheter?`))) return;
    try {
      await suspendFighterAccess(token, householdId, fighter.id, fighter.accountStatus !== 'suspended');
      await refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };
  const unlinkAccount = async () => {
    if (!window.confirm(en ? `Unlink ${fighter.name}'s account? Game history is kept.` : `Vil du koble fra kontoen til ${fighter.name}? Spillhistorikken beholdes.`)) return;
    try {
      await unlinkFighterAccount(token, householdId, fighter.id);
      await refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #2b3346' }}>
      <div style={{ fontSize: 10, color: fighter.userId ? '#67D391' : '#8b93a5', fontWeight: 700, marginBottom: 8 }}>
        {fighter.userId
          ? fighter.accountStatus === 'suspended'
            ? (en ? 'Access suspended' : 'Tilgang sperret')
            : (en ? 'Connected account' : 'Tilknyttet konto')
          : (en ? 'Shared local profile' : 'Delt spillerprofil')}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {!fighter.userId && <>
          <button onClick={() => void inviteAdult()} style={smallAction}>{en ? 'Invite adult' : 'Inviter voksen'}</button>
          <button onClick={() => void setupChild()} style={smallAction}>{en ? 'Set up child' : 'Sett opp barn'}</button>
        </>}
        {fighter.userKind === 'child' && <>
          <button onClick={() => void pairChild()} style={smallAction}>{en ? 'Pair device' : 'Par enhet'}</button>
          <button onClick={() => void resetPin()} style={smallAction}>{en ? 'Reset PIN' : 'Nullstill PIN'}</button>
        </>}
        {fighter.userId && (
          <button onClick={() => void toggleAccess()} style={{ ...smallAction, color: fighter.requireOwnDevice ? '#F4B942' : '#67D391' }}>
            {fighter.requireOwnDevice ? (en ? 'Own device required' : 'Krever egen enhet') : (en ? 'Shared device allowed' : 'Delt enhet tillatt')}
          </button>
        )}
        {fighter.userId && <>
          <button onClick={() => void suspendAccess()} style={{ ...smallAction, color: '#F4B942' }}>{fighter.accountStatus === 'suspended' ? (en ? 'Restore access' : 'Gjenopprett tilgang') : (en ? 'Suspend access' : 'Sperr tilgang')}</button>
          <button onClick={() => void unlinkAccount()} style={{ ...smallAction, color: '#ff8f85' }}>{en ? 'Unlink account' : 'Koble fra konto'}</button>
        </>}
      </div>
    </div>
  );
}

const smallAction: React.CSSProperties = {
  border: '1px solid #3b465e', borderRadius: 9, background: '#20293a', color: '#8fc0ff',
  padding: '8px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
};

export function PartyManager() {
  const { actions } = useGame();
  const t = useT();
  return (
    <div style={overlay}>
      <div style={modalHeader}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: PS, fontSize: 13, color: GOLD }}>{t.partyMgrTitle}</div>
          <div style={{ fontSize: 12, color: '#6C7486', marginTop: 8, fontWeight: 500 }}>{t.partyMgrSub}</div>
        </div>
        <button onClick={actions.closePartyManager} style={doneBtn}>{t.done}</button>
      </div>
      <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FighterRows />
      </div>
    </div>
  );
}
