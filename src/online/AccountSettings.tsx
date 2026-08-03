import { useState } from 'react';
import type { Lang } from '../game/types';
import { useGame } from '../store/GameContext';
import { useOnline, type OnlineError } from './OnlineContext';
import { createBootstrapSnapshot, serverConfigToGameState, serverSyncToGameState } from './gameSync';
import { acceptHouseholdInvite, createHouseholdDevicePairing } from './api';

const field: React.CSSProperties = {
  width: '100%', background: '#0f1420', border: '1px solid #333c50', borderRadius: 11,
  padding: '12px 13px', color: '#F6EBDD', fontSize: 14, outline: 'none',
};
const primary: React.CSSProperties = {
  width: '100%', border: 'none', borderRadius: 11, padding: 13,
  background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A',
  fontWeight: 800, cursor: 'pointer',
};
const secondary: React.CSSProperties = {
  width: '100%', border: '1px solid #333c50', borderRadius: 11, padding: '11px 13px',
  background: '#121827', color: '#A8B0BF', fontWeight: 750, cursor: 'pointer',
};

const COPY = {
  no: {
    title: 'Konto', intro: 'Spill sammen på flere enheter, eller fortsett uten konto.',
    register: 'Opprett konto', login: 'Logg inn', name: 'Navn', email: 'E-post', password: 'Passord, minst 10 tegn',
    childLogin: 'Logg inn som barn', sharedLogin: 'Koble til familieenhet', sharedDevice: 'Familieenhet', otherLogin: 'Andre måter å koble til',
    pairingCode: 'Paringskode', pin: 'PIN', deviceName: 'Navn på enheten',
    connecting: 'Kobler til…', family: 'Familien', householdName: 'Navn på familien',
    createHousehold: 'Koble familien til kontoen', creating: 'Kobler til…',
    bootstrapNote: 'Spillere, bosser og fremgang blir tilgjengelig på familiens enheter. En kamp som pågår starter på nytt.',
    connected: 'Tilkoblet', saved: 'Alle endringer er lagret', saving: 'Lagrer endringer…', checking: 'Sjekker tilkoblingen…',
    safeRetry: 'Den siste endringen er trygg på denne enheten. Vi prøver automatisk igjen.',
    retry: 'Prøv igjen', logout: 'Logg ut', peopleDevices: 'Personer og enheter', joinHousehold: 'Bli med i en annen familie',
    createSharedCode: 'Koble til en felles enhet', inviteToken: 'Invitasjonskode', acceptInvite: 'Godta invitasjon',
    advanced: 'Teknisk informasjon', pending: 'endringer venter', lastSync: 'Sist lagret', syncNow: 'Synkroniser nå', role: 'Tilgang',
    fighterNameRequired: 'Gi alle spillerne et navn før familien kobles til.', joinFailed: 'Invitasjonen kunne ikke godtas.',
    errors: {
      'invalid-credentials': 'E-post eller passord er feil.', 'account-exists': 'Det finnes allerede en konto med denne e-postadressen.',
      'session-ended': 'Du har blitt logget ut. Logg inn på nytt.', network: 'Ingen kontakt akkurat nå. Spillet virker fortsatt.',
      server: 'Vi fikk ikke lagret på nett akkurat nå.', 'invalid-request': 'Dette kunne ikke fullføres. Kontroller opplysningene og prøv igjen.', unknown: 'Noe gikk galt.',
    },
  },
  en: {
    title: 'Account', intro: 'Play together across devices, or continue without an account.',
    register: 'Create account', login: 'Sign in', name: 'Name', email: 'Email', password: 'Password, at least 10 characters',
    childLogin: 'Sign in as a child', sharedLogin: 'Connect a family device', sharedDevice: 'Family device', otherLogin: 'Other ways to connect',
    pairingCode: 'Pairing code', pin: 'PIN', deviceName: 'Device name',
    connecting: 'Connecting…', family: 'The family', householdName: 'Family name',
    createHousehold: 'Connect this family', creating: 'Connecting…',
    bootstrapNote: 'Fighters, bosses, and progress become available on family devices. A fight in progress will restart.',
    connected: 'Connected', saved: 'All changes saved', saving: 'Saving changes…', checking: 'Checking connection…',
    safeRetry: 'The latest change is safe on this device. We will retry automatically.',
    retry: 'Try again', logout: 'Sign out', peopleDevices: 'People and devices', joinHousehold: 'Join another family',
    createSharedCode: 'Connect a shared device', inviteToken: 'Invitation code', acceptInvite: 'Accept invitation',
    advanced: 'Technical information', pending: 'changes waiting', lastSync: 'Last saved', syncNow: 'Sync now', role: 'Access',
    fighterNameRequired: 'Name every fighter before connecting the family.', joinFailed: 'The invitation could not be accepted.',
    errors: {
      'invalid-credentials': 'The email or password is incorrect.', 'account-exists': 'An account already exists for this email address.',
      'session-ended': 'You have been signed out. Sign in again.', network: 'No connection right now. The game still works.',
      server: 'We could not save online right now.', 'invalid-request': 'This could not be completed. Check the details and try again.', unknown: 'Something went wrong.',
    },
  },
} as const;

export function AccountSettings({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  const { state, actions } = useOnline();
  const { state: gameState, actions: gameActions } = useGame();
  const [formMode, setFormMode] = useState<'login' | 'register' | 'child' | 'shared'>('register');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pin, setPin] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [householdName, setHouseholdName] = useState<string>(copy.family);
  const [setupError, setSetupError] = useState<string | null>(null);
  const busy = state.status === 'syncing' || state.status === 'restoring';
  const signedIn = Boolean(state.sessionToken || state.householdDeviceToken);
  const needsRetry = state.status === 'offline' || state.status === 'error' || state.pendingMutationCount > 0;
  const isParent = state.mode === 'adult-account' && (state.role === 'owner' || state.role === 'parent');

  async function authenticate() {
    setSetupError(null);
    try {
      if (formMode === 'register') await actions.registerAdult(email.trim(), password, displayName.trim());
      else if (formMode === 'login') await actions.loginAdult(email.trim(), password);
      else if (formMode === 'child') await actions.loginChildWithPairing(pairingCode.trim().toUpperCase(), pin, deviceName.trim(), 'android');
      else await actions.pairHouseholdDevice(pairingCode.trim().toUpperCase(), deviceName.trim(), 'android');
      setPassword('');
    } catch {
      // The centralized state exposes a localized, non-sensitive error.
    }
  }

  async function createSharedPairing() {
    if (!state.sessionToken || !state.householdId) return;
    setSetupError(null);
    try {
      const pairing = await createHouseholdDevicePairing(state.sessionToken, state.householdId);
      window.alert(lang === 'en' ? `Pairing code: ${pairing.code}` : `Paringskode: ${pairing.code}`);
    } catch {
      setSetupError(copy.errors['invalid-request']);
    }
  }

  async function acceptInvite() {
    if (!state.sessionToken || !inviteToken.trim()) return;
    setSetupError(null);
    try {
      await acceptHouseholdInvite(state.sessionToken, inviteToken.trim());
      setInviteToken('');
      await actions.refreshIdentity();
    } catch {
      setSetupError(copy.joinFailed);
    }
  }

  async function createHousehold() {
    setSetupError(null);
    try {
      const snapshot = await createBootstrapSnapshot(gameState.game);
      const configuration = await actions.createHousehold(householdName.trim(), snapshot);
      gameActions.replaceGame(serverConfigToGameState(configuration, gameState.game));
    } catch (error) {
      if (error instanceof Error && error.message === 'fighter_name_required') setSetupError(copy.fighterNameRequired);
    }
  }

  async function synchronize() {
    setSetupError(null);
    try {
      const sync = await actions.syncNow();
      if (sync) gameActions.replaceGame(serverSyncToGameState(sync, gameState.game));
    } catch {
      // The calm save-state message remains visible and the queue is retained.
    }
  }

  const status = busy
    ? { icon: '↻', text: state.status === 'restoring' ? copy.checking : copy.saving, color: '#8fc0ff' }
    : needsRetry
      ? { icon: '●', text: copy.safeRetry, color: '#F4B942' }
      : { icon: '✓', text: copy.saved, color: '#67D391' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section style={card}>
        <div style={{ fontSize: 18, fontWeight: 850, color: '#F6EBDD' }}>{copy.title}</div>
        {!signedIn && <div style={{ fontSize: 13, color: '#A8B0BF', lineHeight: 1.55, marginTop: 7 }}>{copy.intro}</div>}
        {!signedIn && state.error && <Notice color="#ff8f85">{copy.errors[state.error as OnlineError]}</Notice>}

        {!signedIn ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <ModeButton active={formMode === 'register'} onClick={() => setFormMode('register')}>{copy.register}</ModeButton>
              <ModeButton active={formMode === 'login'} onClick={() => setFormMode('login')}>{copy.login}</ModeButton>
            </div>

            {(formMode === 'register' || formMode === 'login') && <>
              {formMode === 'register' && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={copy.name} style={field} />}
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder={copy.email} style={field} />
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={formMode === 'register' ? 'new-password' : 'current-password'} placeholder={copy.password} style={field} />
            </>}

            {(formMode === 'child' || formMode === 'shared') && <>
              <input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} autoCapitalize="characters" placeholder={copy.pairingCode} style={field} />
              {formMode === 'child' && <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" placeholder={copy.pin} style={field} />}
              <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder={copy.deviceName} style={field} />
            </>}

            <button disabled={busy || (formMode === 'child' || formMode === 'shared' ? pairingCode.trim().length < 4 || (formMode === 'child' && pin.length < 4) : !email.trim() || password.length < 10 || (formMode === 'register' && !displayName.trim()))} onClick={authenticate} style={{ ...primary, opacity: busy ? .6 : 1 }}>
              {busy ? copy.connecting : formMode === 'register' ? copy.register : formMode === 'child' ? copy.childLogin : formMode === 'shared' ? copy.sharedLogin : copy.login}
            </button>

            <details style={details}>
              <summary style={summary}>{copy.otherLogin}</summary>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <button onClick={() => setFormMode('child')} style={secondary}>{copy.childLogin}</button>
                <button onClick={() => setFormMode('shared')} style={secondary}>{copy.sharedLogin}</button>
              </div>
            </details>
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 18, color: '#F6EBDD', fontWeight: 850 }}>{state.account?.displayName || state.account?.email || copy.sharedDevice}</div>
            {state.account?.email && <div style={{ color: '#7D8698', fontSize: 13, marginTop: 3 }}>{state.account.email}</div>}

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 15, padding: 12, borderRadius: 12, background: `${status.color}10`, border: `1px solid ${status.color}45`, color: status.color }}>
              <span style={{ fontWeight: 900, lineHeight: 1.4 }}>{status.icon}</span>
              <span style={{ fontSize: 13, lineHeight: 1.45, fontWeight: 700 }}>{status.text}</span>
            </div>

            {state.error && !needsRetry && <Notice color="#ff8f85">{copy.errors[state.error as OnlineError]}</Notice>}
            {setupError && <Notice color="#ff8f85">{setupError}</Notice>}

            {!state.configurationConnectedAt && state.mode === 'adult-account' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 15 }}>
                <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} placeholder={copy.householdName} style={field} />
                <button disabled={busy || !householdName.trim()} onClick={createHousehold} style={primary}>{busy ? copy.creating : copy.createHousehold}</button>
                <div style={{ fontSize: 12, color: '#8E97A8', lineHeight: 1.5 }}>{copy.bootstrapNote}</div>
              </div>
            ) : state.householdId && state.configurationConnectedAt ? (
              <div style={{ marginTop: 13, padding: 13, borderRadius: 12, background: '#121827', border: '1px solid #2b3346' }}>
                <div style={{ color: '#7D8698', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .7 }}>{copy.connected}</div>
                <div style={{ color: '#F6EBDD', fontSize: 16, fontWeight: 850, marginTop: 4 }}>{state.householdName || copy.family}</div>
              </div>
            ) : null}

            {needsRetry && <button disabled={busy} onClick={() => void synchronize()} style={{ ...primary, marginTop: 12 }}>{copy.retry}</button>}
          </div>
        )}
      </section>

      {signedIn && <>
        {state.mode === 'adult-account' && (
          <details style={{ ...card, ...details }}>
            <summary style={summary}>{copy.peopleDevices}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 13 }}>
              {isParent && state.householdId && <button onClick={() => void createSharedPairing()} style={secondary}>{copy.createSharedCode}</button>}
              <details style={details}>
                <summary style={{ ...summary, fontSize: 13 }}>{copy.joinHousehold}</summary>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input value={inviteToken} onChange={(event) => setInviteToken(event.target.value)} placeholder={copy.inviteToken} style={field} />
                  <button disabled={!inviteToken.trim() || busy} onClick={() => void acceptInvite()} style={{ ...primary, width: 'auto', whiteSpace: 'nowrap' }}>{copy.acceptInvite}</button>
                </div>
              </details>
            </div>
          </details>
        )}

        <details style={{ ...card, ...details }}>
          <summary style={summary}>{copy.advanced}</summary>
          <div style={{ color: '#7D8698', fontSize: 12, lineHeight: 1.6, marginTop: 11 }}>
            {state.pendingMutationCount} {copy.pending}<br />
            {state.lastSuccessfulSyncAt && <>{copy.lastSync}: {new Date(state.lastSuccessfulSyncAt).toLocaleString(lang === 'en' ? 'en-GB' : 'nb-NO')}<br /></>}
            {state.role && <>{copy.role}: {state.role}</>}
          </div>
          <button disabled={busy || !state.configurationConnectedAt} onClick={() => void synchronize()} style={{ ...secondary, marginTop: 10 }}>{copy.syncNow}</button>
        </details>

        <button onClick={() => void actions.logout()} style={{ ...secondary, color: '#C1C7D2' }}>{copy.logout}</button>
      </>}
    </div>
  );
}

const card: React.CSSProperties = {
  background: '#1b2130', border: '1px solid #2b3346', borderRadius: 16, padding: 16,
};
const details: React.CSSProperties = { color: '#A8B0BF' };
const summary: React.CSSProperties = { cursor: 'pointer', color: '#D4D9E2', fontSize: 14, fontWeight: 800, listStylePosition: 'inside' };

function ModeButton({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ ...secondary, background: active ? 'rgba(244,185,66,.16)' : '#121827', color: active ? '#F4B942' : '#A8B0BF', borderColor: active ? 'rgba(244,185,66,.4)' : '#333c50' }}>{children}</button>;
}

function Notice({ children, color }: { children: React.ReactNode; color: string }) {
  return <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: `${color}12`, border: `1px solid ${color}55`, color, fontSize: 12, lineHeight: 1.45 }}>{children}</div>;
}
