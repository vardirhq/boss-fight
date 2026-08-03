import { useEffect, useState } from 'react';
import {
  bootstrapHousehold,
  getMe,
  loadOnlineSession,
  loginAdult,
  logoutOnline,
  registerAdult,
  saveOnlineSession,
  type OnlineSession,
} from './api';

const field: React.CSSProperties = {
  width: '100%', background: '#0f1420', border: '1px solid #333c50', borderRadius: 11,
  padding: '12px 13px', color: '#F6EBDD', fontSize: 14, outline: 'none',
};
const primary: React.CSSProperties = {
  width: '100%', border: 'none', borderRadius: 11, padding: 13,
  background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A',
  fontWeight: 800, cursor: 'pointer',
};

export function AccountSettings() {
  const [session, setSession] = useState<OnlineSession | null>(() => loadOnlineSession());
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [householdName, setHouseholdName] = useState('Familien');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session?.token) return;
    getMe(session.token).then((me) => {
      const household = me.households[0];
      const next = { ...session, user: { ...session.user, ...me.user }, householdId: household?.id ?? session.householdId };
      setSession(next);
      saveOnlineSession(next);
    }).catch(() => {
      setSession(null);
      saveOnlineSession(null);
    });
  }, []); // validate the persisted session once

  async function authenticate() {
    setBusy(true);
    setError('');
    try {
      const next = mode === 'register'
        ? await registerAdult(email, password, displayName)
        : await loginAdult(email, password);
      setSession(next);
      saveOnlineSession(next);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke logge inn');
    } finally {
      setBusy(false);
    }
  }

  async function createHousehold() {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const result = await bootstrapHousehold(session.token, householdName);
      const next = { ...session, householdId: result.householdId };
      setSession(next);
      saveOnlineSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke opprette husholdning');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (session) await logoutOnline(session.token).catch(() => undefined);
    setSession(null);
    saveOnlineSession(null);
  }

  return (
    <div style={{ background: '#1b2130', border: '1px solid #2b3346', borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#F6EBDD' }}>Konto og husholdning</div>
      <div style={{ fontSize: 12, color: '#6C7486', lineHeight: 1.5, marginTop: 5 }}>
        Lokal spilling fortsetter som før. Kontoen blir grunnlaget for synk og egne spillerinnlogginger.
      </div>

      {!session ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMode('register')} style={{ ...primary, background: mode === 'register' ? 'rgba(244,185,66,.18)' : '#0f1420', color: mode === 'register' ? '#F4B942' : '#A8B0BF', border: '1px solid #333c50' }}>Opprett konto</button>
            <button onClick={() => setMode('login')} style={{ ...primary, background: mode === 'login' ? 'rgba(244,185,66,.18)' : '#0f1420', color: mode === 'login' ? '#F4B942' : '#A8B0BF', border: '1px solid #333c50' }}>Logg inn</button>
          </div>
          {mode === 'register' && <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Navn" style={field} />}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="E-post" style={field} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="Passord, minst 10 tegn" style={field} />
          <button disabled={busy || !email || !password || (mode === 'register' && !displayName)} onClick={authenticate} style={{ ...primary, opacity: busy ? .6 : 1 }}>{busy ? 'Kobler til…' : mode === 'register' ? 'Opprett konto' : 'Logg inn'}</button>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: '#67D391', fontWeight: 800 }}>{session.user.displayName || session.user.email}</div>
          <div style={{ color: '#6C7486', fontSize: 12, marginTop: 3 }}>{session.user.email}</div>
          {!session.householdId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 13 }}>
              <input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="Navn på husholdningen" style={field} />
              <button disabled={busy || !householdName.trim()} onClick={createHousehold} style={primary}>{busy ? 'Oppretter…' : 'Opprett husholdning'}</button>
              <div style={{ fontSize: 11, color: '#6C7486', lineHeight: 1.5 }}>Dette oppretter bare husholdningen på serveren. Opplasting av dagens lokale spilldata kommer i neste migreringssteg.</div>
            </div>
          ) : (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 11, background: 'rgba(103,211,145,.09)', border: '1px solid rgba(103,211,145,.3)', color: '#A8B0BF', fontSize: 12 }}>
              Husholdning tilkoblet. Lokal data er foreløpig fortsatt autoritativ på denne enheten.
            </div>
          )}
          <button onClick={signOut} style={{ marginTop: 12, background: 'none', border: '1px solid #333c50', borderRadius: 10, padding: '10px 13px', color: '#A8B0BF', cursor: 'pointer' }}>Logg ut</button>
        </div>
      )}
      {error && <div style={{ marginTop: 10, color: '#ff8f85', fontSize: 12 }}>{error}</div>}
    </div>
  );
}
