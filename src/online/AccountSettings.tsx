import { useState } from 'react';
import type { Lang } from '../game/types';
import { useGame } from '../store/GameContext';
import { useOnline, type OnlineError, type OnlineMode, type OnlineStatus } from './OnlineContext';
import { createBootstrapSnapshot, serverConfigToGameState } from './gameSync';

const field: React.CSSProperties = {
  width: '100%', background: '#0f1420', border: '1px solid #333c50', borderRadius: 11,
  padding: '12px 13px', color: '#F6EBDD', fontSize: 14, outline: 'none',
};
const primary: React.CSSProperties = {
  width: '100%', border: 'none', borderRadius: 11, padding: 13,
  background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A',
  fontWeight: 800, cursor: 'pointer',
};

const COPY = {
  no: {
    title: 'Konto og husholdning', intro: 'Lokal spilling fortsetter som før. Konto er valgfritt og brukes til synk og egne spillerinnlogginger.',
    register: 'Opprett konto', login: 'Logg inn', name: 'Navn', email: 'E-post', password: 'Passord, minst 10 tegn',
    connecting: 'Kobler til…', family: 'Familien', householdName: 'Navn på husholdningen', createHousehold: 'Opprett netthusholdning', creating: 'Oppretter…',
    bootstrapNote: 'Dette laster opp oppsettet og nullstiller en kamp som pågår. Deretter blir serveren fasiten, mens denne enheten beholder en lokal kopi for frakoblet bruk.', connected: 'Husholdningen er koblet til. Serveren er fasiten, og denne enheten bruker en lokal kopi når den er frakoblet.',
    logout: 'Logg ut', sync: 'Hent fra server', restoring: 'Sjekker økten…', offline: 'Frakoblet – den sist lagrede kopien virker fortsatt.',
    fighterNameRequired: 'Gi alle spillerne et navn før du kobler spillet til serveren.', syncFailed: 'Kunne ikke hente spilloppsettet fra serveren.',
    local: 'Kun lokal', adult: 'Voksenkonto', child: 'Spillerkonto', shared: 'Delt husholdningsenhet', role: 'Rolle',
    errors: {
      'invalid-credentials': 'E-post eller passord er feil.', 'account-exists': 'Det finnes allerede en konto med denne e-postadressen.',
      'session-ended': 'Økten er utløpt eller trukket tilbake. Logg inn på nytt.', network: 'Ingen kontakt med serveren. Lokal spilling er ikke berørt.',
      server: 'Serveren er midlertidig utilgjengelig. Prøv igjen senere.', 'invalid-request': 'Forespørselen kunne ikke fullføres.', unknown: 'Noe gikk galt.',
    },
  },
  en: {
    title: 'Account and household', intro: 'Local play continues as before. Accounts are optional and enable sync and personal fighter sign-ins.',
    register: 'Create account', login: 'Sign in', name: 'Name', email: 'Email', password: 'Password, at least 10 characters',
    connecting: 'Connecting…', family: 'The family', householdName: 'Household name', createHousehold: 'Create online household', creating: 'Creating…',
    bootstrapNote: 'This uploads the current setup and resets any fight in progress. After that, the server is authoritative and this device keeps a local copy for offline use.', connected: 'The household is connected. The server is authoritative, with a local copy available while this device is offline.',
    logout: 'Sign out', sync: 'Fetch from server', restoring: 'Checking session…', offline: 'Offline – the last saved copy still works.',
    fighterNameRequired: 'Name every fighter before connecting the game to the server.', syncFailed: 'The game configuration could not be fetched from the server.',
    local: 'Local only', adult: 'Adult account', child: 'Fighter account', shared: 'Shared household device', role: 'Role',
    errors: {
      'invalid-credentials': 'The email or password is incorrect.', 'account-exists': 'An account already exists for this email address.',
      'session-ended': 'This session expired or was revoked. Sign in again.', network: 'The server cannot be reached. Local play is unaffected.',
      server: 'The server is temporarily unavailable. Try again later.', 'invalid-request': 'The request could not be completed.', unknown: 'Something went wrong.',
    },
  },
} as const;

function modeLabel(mode: OnlineMode, copy: typeof COPY.no | typeof COPY.en) {
  if (mode === 'adult-account') return copy.adult;
  if (mode === 'fighter-account') return copy.child;
  if (mode === 'household-device') return copy.shared;
  return copy.local;
}

function statusColor(status: OnlineStatus) {
  if (status === 'authenticated') return '#67D391';
  if (status === 'offline') return '#F4B942';
  if (status === 'error') return '#ff8f85';
  return '#8fc0ff';
}

export function AccountSettings({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  const { state, actions } = useOnline();
  const { state: gameState, actions: gameActions } = useGame();
  const [formMode, setFormMode] = useState<'login' | 'register'>('register');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [householdName, setHouseholdName] = useState<string>(copy.family);
  const [setupError, setSetupError] = useState<string | null>(null);
  const busy = state.status === 'syncing' || state.status === 'restoring';

  async function authenticate() {
    try {
      if (formMode === 'register') await actions.registerAdult(email.trim(), password, displayName.trim());
      else await actions.loginAdult(email.trim(), password);
      setPassword('');
    } catch {
      // The centralized online state exposes a localized-safe error code.
    }
  }

  async function createHousehold() {
    setSetupError(null);
    try {
      const snapshot = await createBootstrapSnapshot(gameState.game);
      const configuration = await actions.createHousehold(householdName.trim(), snapshot);
      gameActions.replaceGame(serverConfigToGameState(configuration, gameState.game));
    } catch (error) {
      if (error instanceof Error && error.message === 'fighter_name_required') {
        setSetupError(copy.fighterNameRequired);
      }
      // The centralized online state exposes a localized-safe error code.
    }
  }

  async function syncConfiguration() {
    setSetupError(null);
    try {
      await actions.refreshIdentity();
      const configuration = await actions.getConfiguration();
      gameActions.replaceGame(serverConfigToGameState(configuration, gameState.game));
    } catch {
      setSetupError(copy.syncFailed);
    }
  }

  return (
    <div style={{ background: '#1b2130', border: '1px solid #2b3346', borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#F6EBDD' }}>{copy.title}</div>
          <div style={{ fontSize: 11, color: statusColor(state.status), fontWeight: 800, marginTop: 5 }}>
            {modeLabel(state.mode, copy)}
            {state.role ? ` · ${copy.role}: ${state.role}` : ''}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#A8B0BF', lineHeight: 1.5, marginTop: 8 }}>{copy.intro}</div>

      {state.status === 'restoring' && <Notice color="#8fc0ff">{copy.restoring}</Notice>}
      {state.status === 'offline' && <Notice color="#F4B942">{copy.offline}</Notice>}
      {state.error && <Notice color="#ff8f85">{copy.errors[state.error as OnlineError]}</Notice>}
      {setupError && <Notice color="#ff8f85">{setupError}</Notice>}

      {!state.sessionToken ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setFormMode('register')} style={{ ...primary, background: formMode === 'register' ? 'rgba(244,185,66,.18)' : '#0f1420', color: formMode === 'register' ? '#F4B942' : '#A8B0BF', border: '1px solid #333c50' }}>{copy.register}</button>
            <button onClick={() => setFormMode('login')} style={{ ...primary, background: formMode === 'login' ? 'rgba(244,185,66,.18)' : '#0f1420', color: formMode === 'login' ? '#F4B942' : '#A8B0BF', border: '1px solid #333c50' }}>{copy.login}</button>
          </div>
          {formMode === 'register' && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={copy.name} style={field} />}
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder={copy.email} style={field} />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={formMode === 'register' ? 'new-password' : 'current-password'} placeholder={copy.password} style={field} />
          <button disabled={busy || !email.trim() || password.length < 10 || (formMode === 'register' && !displayName.trim())} onClick={authenticate} style={{ ...primary, opacity: busy ? .6 : 1 }}>
            {busy ? copy.connecting : formMode === 'register' ? copy.register : copy.login}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: '#67D391', fontWeight: 800 }}>{state.account?.displayName || state.account?.email}</div>
          {state.account?.email && <div style={{ color: '#6C7486', fontSize: 12, marginTop: 3 }}>{state.account.email}</div>}
          {!state.configurationConnectedAt && state.mode === 'adult-account' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 13 }}>
              <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} placeholder={copy.householdName} style={field} />
              <button disabled={busy || !householdName.trim()} onClick={createHousehold} style={primary}>{busy ? copy.creating : copy.createHousehold}</button>
              <div style={{ fontSize: 11, color: '#6C7486', lineHeight: 1.5 }}>{copy.bootstrapNote}</div>
            </div>
          ) : state.householdId && state.configurationConnectedAt ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 11, background: 'rgba(103,211,145,.09)', border: '1px solid rgba(103,211,145,.3)', color: '#A8B0BF', fontSize: 12 }}>
              {state.householdName && <strong style={{ color: '#F6EBDD' }}>{state.householdName}<br /></strong>}
              {copy.connected}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button disabled={busy || !state.configurationConnectedAt} onClick={() => void syncConfiguration()} style={{ flex: 1, background: 'none', border: '1px solid #333c50', borderRadius: 10, padding: '10px 13px', color: '#8fc0ff', cursor: 'pointer', opacity: state.configurationConnectedAt ? 1 : .5 }}>{copy.sync}</button>
            <button onClick={() => void actions.logout()} style={{ flex: 1, background: 'none', border: '1px solid #333c50', borderRadius: 10, padding: '10px 13px', color: '#A8B0BF', cursor: 'pointer' }}>{copy.logout}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Notice({ children, color }: { children: React.ReactNode; color: string }) {
  return <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 9, background: `${color}12`, border: `1px solid ${color}55`, color, fontSize: 12 }}>{children}</div>;
}
