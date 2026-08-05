import { useEffect, useState } from 'react';
import type { Lang } from '../game/types';
import { useGame } from '../store/GameContext';
import { useOnline, type OnlineError } from './OnlineContext';
import { createBootstrapSnapshot, serverConfigToGameState, serverSyncToGameState } from './gameSync';
import { acceptHouseholdInvite, ApiError, confirmPasswordReset, createHouseholdDevicePairing, eraseAdultAccount, eraseHousehold, getAccountSessions, getHouseholdExport, inviteParent, requestPasswordReset, revokeAccountSession, type AccountSession } from './api';

const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#0f1420', border: '1px solid #333c50', borderRadius: 12,
  padding: '13px 14px', color: '#F6EBDD', fontSize: 15, outline: 'none',
};
const primary: React.CSSProperties = {
  width: '100%', border: 'none', borderRadius: 12, padding: 14,
  background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A',
  fontWeight: 850, fontSize: 15, cursor: 'pointer',
};
const secondary: React.CSSProperties = {
  width: '100%', border: '1px solid #333c50', borderRadius: 12, padding: '12px 14px',
  background: '#121827', color: '#C5CBD6', fontWeight: 750, fontSize: 14, cursor: 'pointer',
};
const card: React.CSSProperties = {
  background: '#1b2130', border: '1px solid #2b3346', borderRadius: 18, padding: 17,
};
const details: React.CSSProperties = { color: '#A8B0BF' };
const summary: React.CSSProperties = { cursor: 'pointer', color: '#D4D9E2', fontSize: 14, fontWeight: 800, listStylePosition: 'inside' };

const COPY = {
  no: {
    welcome: 'Hele familien. Samme spill.', welcomeBody: 'Opprett en konto for å ta med spillerne, fremgangen og belønningene til familiens enheter.',
    accountStep: '1 av 2 · Din konto', familyStep: '2 av 2 · Familien',
    register: 'Opprett konto', login: 'Logg inn', name: 'Navn', email: 'E-post', password: 'Passord, minst 10 tegn',
    forgotPassword: 'Glemt passord?', recoveryBody: 'Vi sender en engangskode hvis e-postadressen tilhører en konto.', sendRecovery: 'Send engangskode', recoverySent: 'Hvis kontoen finnes, er en kode sendt. Sjekk også søppelpost.', resetToken: 'Engangskode fra e-posten', newPassword: 'Nytt passord, minst 10 tegn', resetPassword: 'Lagre nytt passord', resetComplete: 'Passordet er endret. Du kan logge inn nå.', resetFailed: 'Koden er ugyldig eller utløpt.',
    childLogin: 'Jeg har en barnekode', sharedLogin: 'Dette er en familieenhet', sharedDevice: 'Familieenhet', otherLogin: 'Har du fått en kode?',
    familyInvite: 'Jeg har en familieinvitasjon', createAndJoin: 'Opprett konto og bli med', loginAndJoin: 'Logg inn og bli med',
    pairingCode: 'Kode', pin: 'PIN', deviceName: 'Navn på enheten', connecting: 'Kobler til…',
    familyTitle: 'Hvordan vil du fortsette?', familyBody: 'Start familiens Boss Kamp, eller bruk en invitasjon for å bli med i en som finnes.',
    createChoice: 'Start en familie', createChoiceSub: 'Din spiller lages automatisk', joinChoice: 'Bli med i en familie', joinChoiceSub: 'Skriv inn invitasjonskoden du har fått',
    family: 'Familien', householdName: 'Navn på familien', createHousehold: 'Start familiens Boss Kamp', creating: 'Gjør klart…',
    bootstrapNote: 'Vi tar med spillerne, bossene og fremgangen din. Kampen som pågår starter på nytt.',
    back: 'Tilbake', inviteToken: 'Invitasjonskode', acceptInvite: 'Bli med', joining: 'Blir med…',
    connected: 'Familien er tilkoblet', saved: 'Alt er lagret', saving: 'Lagrer…', checking: 'Sjekker tilkoblingen…',
    safeRetry: 'Endringen er trygg på denne enheten. Vi prøver igjen automatisk.', retry: 'Prøv igjen',
    household: 'Familie', fighters: 'Spillere', peopleDevices: 'Personer og enheter',
    yourFighter: 'Din spiller', yourFighterSub: 'Laget fra kontoen din', otherPlayers: 'Andre spillere', otherPlayersSub: 'Legg bare til personer som spiller på denne enheten', addPlayer: 'Legg til barn eller annen spiller', playerName: 'Navn på spiller',
    inviteParent: 'Inviter en annen forelder', parentEmail: 'E-post til den andre forelderen', createInvite: 'Send invitasjon',
    parentInviteSent: 'Invitasjonen er sendt til {email}.', inviteSendFailed: 'E-posten kunne ikke sendes. Prøv igjen senere.',
    createSharedCode: 'Koble til en felles enhet', sharedCodeTitle: 'Skriv denne koden på familieenheten', copy: 'Kopier', copied: 'Kopiert',
    privacyData: 'Personvern og familiedata', privacyDataBody: 'Last ned en JSON-kopi av familieoppsettet, spillerne og aktivitetshistorikken som er lagret på nett.', downloadData: 'Last ned familiedata', downloadingData: 'Laster ned…', exportFailed: 'Familiedataene kunne ikke lastes ned.',
    eraseFamily: 'Slett familien permanent', eraseFamilyBody: 'Sletter alle spillere, barnekontoer, enheter, oppsett, aktivitet, mynter og belønninger fra serveren. Voksenkontoene beholdes. Dette kan ikke angres.', confirmFamilyName: 'Skriv familienavnet nøyaktig', currentPassword: 'Ditt nåværende passord', eraseFamilyButton: 'Slett alle familiedata', erasingFamily: 'Sletter…', eraseFamilyFailed: 'Familien kunne ikke slettes. Kontroller navnet og passordet.',
    eraseAccount: 'Slett voksenkontoen permanent', eraseAccountBody: 'Sletter e-post, navn, innlogging, enheter, medlemskap og spilleridentitet. Du må først slette familien eller gi eierrollen til en annen eier. Dette kan ikke angres.', confirmEmail: 'Skriv e-postadressen nøyaktig', eraseAccountButton: 'Slett voksenkontoen', erasingAccount: 'Sletter konto…', eraseAccountFailed: 'Kontoen kunne ikke slettes. Kontroller e-post og passord, og sørg for at alle familier har en annen eier.',
    sessions: 'Innloggede enheter', sessionsBody: 'Se aktive innlogginger og avslutt dem du ikke kjenner igjen.', currentSession: 'Denne enheten', sessionFallback: 'Nettleser eller ukjent enhet', lastUsed: 'Sist brukt', sessionExpires: 'Utløper', revokeSession: 'Logg ut enheten', loadingSessions: 'Henter innlogginger…', sessionsFailed: 'Innloggingene kunne ikke hentes.',
    joinHousehold: 'Bytt eller bli med i en annen familie', logout: 'Logg ut',
    advanced: 'Teknisk informasjon', pending: 'endringer venter', rejected: 'avviste endringer krever oppfølging', revision: 'Konfigurasjonsversjon', lastSync: 'Sist lagret', syncNow: 'Synkroniser nå', role: 'Tilgang',
    fighterNameRequired: 'Gi alle spillerne et navn før familien opprettes.', joinFailed: 'Invitasjonen kunne ikke godtas.',
    errors: {
      'invalid-credentials': 'E-post eller passord er feil.', 'account-exists': 'Det finnes allerede en konto med denne e-postadressen.',
      'session-ended': 'Du har blitt logget ut. Logg inn på nytt.', network: 'Ingen kontakt akkurat nå. Prøv igjen når du har nett.',
      server: 'Vi fikk ikke lagret på nett akkurat nå.', 'invalid-request': 'Dette kunne ikke fullføres. Kontroller opplysningene og prøv igjen.', unknown: 'Noe gikk galt.',
    },
  },
  en: {
    welcome: 'The whole family. One game.', welcomeBody: 'Create an account to bring fighters, progress, and rewards to your family’s devices.',
    accountStep: '1 of 2 · Your account', familyStep: '2 of 2 · The family',
    register: 'Create account', login: 'Sign in', name: 'Name', email: 'Email', password: 'Password, at least 10 characters',
    forgotPassword: 'Forgot password?', recoveryBody: 'We will send a one-time code if the email address belongs to an account.', sendRecovery: 'Send one-time code', recoverySent: 'If the account exists, a code has been sent. Check your spam folder too.', resetToken: 'One-time code from the email', newPassword: 'New password, at least 10 characters', resetPassword: 'Save new password', resetComplete: 'Your password has been changed. You can sign in now.', resetFailed: 'The code is invalid or has expired.',
    childLogin: 'I have a child code', sharedLogin: 'This is a family device', sharedDevice: 'Family device', otherLogin: 'Have you received a code?',
    familyInvite: 'I have a family invitation', createAndJoin: 'Create account and join', loginAndJoin: 'Sign in and join',
    pairingCode: 'Code', pin: 'PIN', deviceName: 'Device name', connecting: 'Connecting…',
    familyTitle: 'How would you like to continue?', familyBody: 'Start your family’s Boss Kamp, or use an invitation to join an existing one.',
    createChoice: 'Start a family', createChoiceSub: 'Your fighter is created automatically', joinChoice: 'Join a family', joinChoiceSub: 'Enter the invitation code you received',
    family: 'The family', householdName: 'Family name', createHousehold: 'Start the family’s Boss Kamp', creating: 'Getting ready…',
    bootstrapNote: 'We will bring your fighters, bosses, and progress. The current fight will restart.',
    back: 'Back', inviteToken: 'Invitation code', acceptInvite: 'Join', joining: 'Joining…',
    connected: 'Family connected', saved: 'Everything is saved', saving: 'Saving…', checking: 'Checking connection…',
    safeRetry: 'The change is safe on this device. We will retry automatically.', retry: 'Try again',
    household: 'Family', fighters: 'Fighters', peopleDevices: 'People and devices',
    yourFighter: 'Your fighter', yourFighterSub: 'Created from your account', otherPlayers: 'Other fighters', otherPlayersSub: 'Only add people who play on this device', addPlayer: 'Add a child or another fighter', playerName: 'Fighter name',
    inviteParent: 'Invite another parent', parentEmail: 'The other parent’s email', createInvite: 'Send invitation',
    parentInviteSent: 'The invitation was sent to {email}.', inviteSendFailed: 'The email could not be sent. Try again later.',
    createSharedCode: 'Connect a shared device', sharedCodeTitle: 'Enter this code on the family device', copy: 'Copy', copied: 'Copied',
    privacyData: 'Privacy and family data', privacyDataBody: 'Download a JSON copy of the family configuration, fighters, and activity history stored online.', downloadData: 'Download family data', downloadingData: 'Downloading…', exportFailed: 'The family data could not be downloaded.',
    eraseFamily: 'Permanently erase family', eraseFamilyBody: 'Deletes every fighter, child account, device, configuration item, activity, coin, and reward from the server. Adult accounts remain. This cannot be undone.', confirmFamilyName: 'Enter the exact family name', currentPassword: 'Your current password', eraseFamilyButton: 'Erase all family data', erasingFamily: 'Erasing…', eraseFamilyFailed: 'The family could not be erased. Check the name and password.',
    eraseAccount: 'Permanently erase adult account', eraseAccountBody: 'Deletes your email, name, login, devices, memberships, and fighter identity. You must first erase the family or transfer ownership to another owner. This cannot be undone.', confirmEmail: 'Enter the exact email address', eraseAccountButton: 'Erase adult account', erasingAccount: 'Erasing account…', eraseAccountFailed: 'The account could not be erased. Check the email and password, and ensure every family has another owner.',
    sessions: 'Signed-in devices', sessionsBody: 'Review active sign-ins and end any you do not recognize.', currentSession: 'This device', sessionFallback: 'Browser or unknown device', lastUsed: 'Last used', sessionExpires: 'Expires', revokeSession: 'Sign out device', loadingSessions: 'Loading sign-ins…', sessionsFailed: 'Sign-ins could not be loaded.',
    joinHousehold: 'Switch or join another family', logout: 'Sign out',
    advanced: 'Technical information', pending: 'changes waiting', rejected: 'rejected changes need attention', revision: 'Configuration revision', lastSync: 'Last saved', syncNow: 'Sync now', role: 'Access',
    fighterNameRequired: 'Name every fighter before creating the family.', joinFailed: 'The invitation could not be accepted.',
    errors: {
      'invalid-credentials': 'The email or password is incorrect.', 'account-exists': 'An account already exists for this email address.',
      'session-ended': 'You have been signed out. Sign in again.', network: 'No connection right now. Try again when you are online.',
      server: 'We could not save online right now.', 'invalid-request': 'This could not be completed. Check the details and try again.', unknown: 'Something went wrong.',
    },
  },
} as const;

type FamilyMode = 'pick' | 'create' | 'join';

export function AccountSettings({ lang, setup = false }: { lang: Lang; setup?: boolean }) {
  const copy = COPY[lang];
  const { state, actions } = useOnline();
  const { state: gameState, actions: gameActions } = useGame();
  const [formMode, setFormMode] = useState<'login' | 'register' | 'invite' | 'child' | 'shared'>('register');
  const [inviteAuthMode, setInviteAuthMode] = useState<'login' | 'register'>('register');
  const [acceptInviteAfterAuth, setAcceptInviteAfterAuth] = useState(false);
  const [familyMode, setFamilyMode] = useState<FamilyMode>('pick');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [recoveryComplete, setRecoveryComplete] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [pin, setPin] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [householdName, setHouseholdName] = useState<string>(copy.family);
  const [sharedCode, setSharedCode] = useState<string | null>(null);
  const [parentEmail, setParentEmail] = useState('');
  const [parentInviteSentTo, setParentInviteSentTo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [exportingData, setExportingData] = useState(false);
  const [eraseFamilyName, setEraseFamilyName] = useState('');
  const [eraseFamilyPassword, setEraseFamilyPassword] = useState('');
  const [erasingFamily, setErasingFamily] = useState(false);
  const [eraseAccountEmail, setEraseAccountEmail] = useState('');
  const [eraseAccountPassword, setEraseAccountPassword] = useState('');
  const [erasingAccount, setErasingAccount] = useState(false);
  const [eraseAccountError, setEraseAccountError] = useState<string | null>(null);
  const [accountSessions, setAccountSessions] = useState<AccountSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const busy = state.status === 'syncing' || state.status === 'restoring';
  const signedIn = Boolean(state.sessionToken || state.householdDeviceToken);
  const connected = Boolean(state.householdId && state.configurationConnectedAt);
  const needsRetry = connected && (state.status === 'offline' || state.status === 'error' || state.pendingMutationCount > 0);
  const isParent = state.mode === 'adult-account' && (state.role === 'owner' || state.role === 'parent');
  const isOwner = state.mode === 'adult-account' && state.role === 'owner';
  const ownFighter = state.userId
    ? gameState.game.fighters.find((fighter) => fighter.userId === state.userId || fighter.id === `account-${state.userId}`)
    : undefined;
  const otherFighters = gameState.game.fighters.filter((fighter) => fighter.id !== ownFighter?.id);

  useEffect(() => {
    if (state.mode !== 'adult-account' || !state.userId || !state.account || connected) return;
    gameActions.ensureAccountFighter(state.userId, state.account.displayName);
  }, [connected, gameActions, state.account, state.mode, state.userId]);

  useEffect(() => {
    if (!acceptInviteAfterAuth || !state.sessionToken || !inviteToken.trim()) return;
    setAcceptInviteAfterAuth(false);
    void acceptHouseholdInvite(state.sessionToken, inviteToken.trim())
      .then(() => actions.refreshIdentity())
      .catch(() => {
        setFamilyMode('join');
        setSetupError(copy.joinFailed);
      });
  }, [acceptInviteAfterAuth, actions, copy.joinFailed, inviteToken, state.sessionToken]);

  useEffect(() => {
    if (state.mode !== 'adult-account' || !state.sessionToken) {
      setAccountSessions(null);
      return;
    }
    let cancelled = false;
    setSessionsError(null);
    void getAccountSessions(state.sessionToken)
      .then((sessions) => { if (!cancelled) setAccountSessions(sessions); })
      .catch(() => { if (!cancelled) setSessionsError(copy.sessionsFailed); });
    return () => { cancelled = true; };
  }, [copy.sessionsFailed, state.mode, state.sessionToken]);

  async function authenticate() {
    setSetupError(null);
    try {
      if (formMode === 'register') await actions.registerAdult(email.trim(), password, displayName.trim());
      else if (formMode === 'login') await actions.loginAdult(email.trim(), password);
      else if (formMode === 'invite') {
        setAcceptInviteAfterAuth(true);
        if (inviteAuthMode === 'register') await actions.registerAdult(email.trim(), password, displayName.trim());
        else await actions.loginAdult(email.trim(), password);
      }
      else if (formMode === 'child') await actions.loginChildWithPairing(pairingCode.trim().toUpperCase(), pin, deviceName.trim(), 'android');
      else await actions.pairHouseholdDevice(pairingCode.trim().toUpperCase(), deviceName.trim(), 'android');
      setPassword('');
    } catch {
      if (formMode === 'invite') setAcceptInviteAfterAuth(false);
      // The centralized state exposes a localized, non-sensitive error.
    }
  }

  async function sendPasswordRecovery() {
    if (!email.trim() || recovering) return;
    setRecovering(true);
    setRecoveryError(null);
    try {
      await requestPasswordReset(email.trim());
      setRecoveryRequested(true);
    } catch {
      setRecoveryError(copy.errors.network);
    } finally {
      setRecovering(false);
    }
  }

  async function finishPasswordRecovery() {
    if (!resetToken.trim() || newPassword.length < 10 || recovering) return;
    setRecovering(true);
    setRecoveryError(null);
    try {
      await confirmPasswordReset(resetToken.trim(), newPassword);
      setRecoveryComplete(true);
      setRecoveryRequested(false);
      setResetToken('');
      setNewPassword('');
      setFormMode('login');
    } catch {
      setRecoveryError(copy.resetFailed);
    } finally {
      setRecovering(false);
    }
  }

  async function createSharedPairing() {
    if (!state.sessionToken || !state.householdId) return;
    setSetupError(null);
    try {
      const pairing = await createHouseholdDevicePairing(state.sessionToken, state.householdId);
      setSharedCode(pairing.code);
    } catch {
      setSetupError(copy.errors['invalid-request']);
    }
  }

  async function copySharedCode() {
    if (!sharedCode) return;
    await navigator.clipboard?.writeText(sharedCode).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function createParentInvitation() {
    if (!state.sessionToken || !state.householdId || !parentEmail.trim()) return;
    setSetupError(null);
    setParentInviteSentTo(null);
    const invitedEmail = parentEmail.trim();
    try {
      await inviteParent(state.sessionToken, state.householdId, invitedEmail);
      setParentInviteSentTo(invitedEmail);
      setParentEmail('');
    } catch (error) {
      setSetupError(error instanceof ApiError && error.code === 'mail_delivery_failed'
        ? copy.inviteSendFailed
        : copy.errors['invalid-request']);
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
      // The queue is retained for the next retry.
    }
  }

  async function downloadFamilyData() {
    if (!state.sessionToken || !state.householdId || !isParent) return;
    setSetupError(null);
    setExportingData(true);
    try {
      const exported = await getHouseholdExport(state.sessionToken, state.householdId);
      const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `boss-kamp-family-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setSetupError(copy.exportFailed);
    } finally {
      setExportingData(false);
    }
  }

  async function eraseFamilyData() {
    if (!state.sessionToken || !state.householdId || !isOwner || erasingFamily) return;
    const householdId = state.householdId;
    setSetupError(null);
    setErasingFamily(true);
    try {
      await eraseHousehold(state.sessionToken, householdId, eraseFamilyPassword, eraseFamilyName);
      actions.forgetHousehold(householdId);
      gameActions.doReset();
      setEraseFamilyName('');
      setEraseFamilyPassword('');
    } catch {
      setSetupError(copy.eraseFamilyFailed);
    } finally {
      setErasingFamily(false);
    }
  }

  async function eraseAccountData() {
    if (!state.sessionToken || state.mode !== 'adult-account' || erasingAccount) return;
    setEraseAccountError(null);
    setErasingAccount(true);
    try {
      await eraseAdultAccount(state.sessionToken, eraseAccountPassword, eraseAccountEmail);
      await actions.logout();
      gameActions.doReset();
    } catch {
      setEraseAccountError(copy.eraseAccountFailed);
    } finally {
      setErasingAccount(false);
    }
  }

  async function revokeSession(session: AccountSession) {
    if (!state.sessionToken || revokingSessionId) return;
    setSessionsError(null);
    setRevokingSessionId(session.id);
    try {
      const result = await revokeAccountSession(state.sessionToken, session.id);
      if (result.current) {
        await actions.logout();
        gameActions.doReset();
      } else {
        setAccountSessions((current) => current?.filter((item) => item.id !== session.id) ?? null);
      }
    } catch {
      setSessionsError(copy.sessionsFailed);
    } finally {
      setRevokingSessionId(null);
    }
  }

  const sessionManagement = state.mode === 'adult-account' ? (
    <details style={{ ...card, ...details }}>
      <summary style={summary}>{copy.sessions}</summary>
      <p style={{ color: '#8E97A8', fontSize: 12.5, lineHeight: 1.5, margin: '11px 0' }}>{copy.sessionsBody}</p>
      {!accountSessions && !sessionsError && <div role="status" style={{ color: '#8E97A8', fontSize: 12 }}>{copy.loadingSessions}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {accountSessions?.map((session) => (
          <div key={session.id} style={{ padding: 12, borderRadius: 12, background: '#121827', border: '1px solid #333c50' }}>
            <div style={{ color: '#D4D9E2', fontSize: 13, fontWeight: 800 }}>
              {session.deviceName || session.platform || copy.sessionFallback}
              {session.current && <span style={{ color: '#67D391', marginLeft: 7, fontSize: 11 }}>· {copy.currentSession}</span>}
            </div>
            <div style={{ color: '#7D8698', fontSize: 11.5, lineHeight: 1.55, marginTop: 4 }}>
              {copy.lastUsed}: {new Date(session.lastUsedAt || session.createdAt).toLocaleString(lang === 'en' ? 'en-GB' : 'nb-NO')}<br />
              {copy.sessionExpires}: {new Date(session.expiresAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nb-NO')}
            </div>
            <button disabled={revokingSessionId !== null} onClick={() => void revokeSession(session)} style={{ ...secondary, marginTop: 8, padding: '9px 11px', color: session.current ? '#ff8f85' : '#C5CBD6' }}>
              {copy.revokeSession}
            </button>
          </div>
        ))}
      </div>
      {sessionsError && <Notice color="#ff8f85">{sessionsError}</Notice>}
    </details>
  ) : null;

  const accountErasure = state.mode === 'adult-account' && state.account?.email ? (
    <details style={{ ...card, ...details }}>
      <summary style={{ ...summary, color: '#ff8f85' }}>{copy.eraseAccount}</summary>
      <p style={{ color: '#A8B0BF', fontSize: 12, lineHeight: 1.5, margin: '10px 0' }}>{copy.eraseAccountBody}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input aria-label={copy.confirmEmail} value={eraseAccountEmail} onChange={(event) => setEraseAccountEmail(event.target.value)} placeholder={copy.confirmEmail} type="email" autoComplete="off" style={field} />
        <input aria-label={copy.currentPassword} value={eraseAccountPassword} onChange={(event) => setEraseAccountPassword(event.target.value)} placeholder={copy.currentPassword} type="password" autoComplete="current-password" style={field} />
        <button disabled={erasingAccount || eraseAccountEmail.trim().toLowerCase() !== state.account.email.toLowerCase() || !eraseAccountPassword} onClick={() => void eraseAccountData()} style={{ ...secondary, color: '#ff8f85', borderColor: '#873f44', opacity: erasingAccount ? .6 : 1 }}>
          {erasingAccount ? copy.erasingAccount : copy.eraseAccountButton}
        </button>
        {eraseAccountError && <Notice color="#ff8f85">{eraseAccountError}</Notice>}
      </div>
    </details>
  ) : null;

  if (!signedIn) {
    return (
      <div style={{ width: '100%', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section style={{ ...card, textAlign: 'center', padding: '24px 18px' }}>
          {setup && <StepLabel>{copy.accountStep}</StepLabel>}
          <div style={{ width: 70, height: 70, margin: '8px auto 18px', borderRadius: 20, background: 'rgba(244,185,66,.13)', border: '1px solid rgba(244,185,66,.3)', display: 'grid', placeItems: 'center', fontSize: 32 }}>🏠</div>
          <h1 style={{ margin: 0, color: '#F6EBDD', fontSize: 24, lineHeight: 1.2 }}>{copy.welcome}</h1>
          <p style={{ margin: '10px auto 0', color: '#A8B0BF', fontSize: 14, lineHeight: 1.55, maxWidth: 330 }}>{copy.welcomeBody}</p>
        </section>

        <section style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <ModeButton active={formMode === 'register'} onClick={() => setFormMode('register')}>{copy.register}</ModeButton>
            <ModeButton active={formMode === 'login'} onClick={() => setFormMode('login')}>{copy.login}</ModeButton>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {(formMode === 'register' || formMode === 'login') && <>
              {formMode === 'register' && <input aria-label={copy.name} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={copy.name} style={field} />}
              <input aria-label={copy.email} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder={copy.email} style={field} />
              <input aria-label={copy.password} value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={formMode === 'register' ? 'new-password' : 'current-password'} placeholder={copy.password} style={field} />
            </>}

            {formMode === 'invite' && <>
              <input aria-label={copy.inviteToken} value={inviteToken} onChange={(event) => setInviteToken(event.target.value)} autoCapitalize="characters" placeholder={copy.inviteToken} style={{ ...field, textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <ModeButton active={inviteAuthMode === 'register'} onClick={() => setInviteAuthMode('register')}>{copy.register}</ModeButton>
                <ModeButton active={inviteAuthMode === 'login'} onClick={() => setInviteAuthMode('login')}>{copy.login}</ModeButton>
              </div>
              {inviteAuthMode === 'register' && <input aria-label={copy.name} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={copy.name} style={field} />}
              <input aria-label={copy.email} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder={copy.email} style={field} />
              <input aria-label={copy.password} value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={inviteAuthMode === 'register' ? 'new-password' : 'current-password'} placeholder={copy.password} style={field} />
            </>}

            {(formMode === 'child' || formMode === 'shared') && <>
              <input aria-label={copy.pairingCode} value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} autoCapitalize="characters" placeholder={copy.pairingCode} style={{ ...field, textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1 }} />
              {formMode === 'child' && <input aria-label={copy.pin} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" placeholder={copy.pin} style={field} />}
              <input aria-label={copy.deviceName} value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder={copy.deviceName} style={field} />
            </>}

            {state.error && <Notice color="#ff8f85">{copy.errors[state.error as OnlineError]}</Notice>}
            <button disabled={busy || (formMode === 'child' || formMode === 'shared'
              ? pairingCode.trim().length < 4 || !deviceName.trim() || (formMode === 'child' && pin.length < 4)
              : !email.trim() || password.length < 10 || (formMode === 'register' && !displayName.trim()) || (formMode === 'invite' && (!inviteToken.trim() || (inviteAuthMode === 'register' && !displayName.trim()))))} onClick={authenticate} style={{ ...primary, opacity: busy ? .6 : 1 }}>
              {busy ? copy.connecting : formMode === 'register' ? copy.register : formMode === 'invite' ? (inviteAuthMode === 'register' ? copy.createAndJoin : copy.loginAndJoin) : formMode === 'child' ? copy.childLogin : formMode === 'shared' ? copy.sharedLogin : copy.login}
            </button>
          </div>

          <details style={{ ...details, marginTop: 14 }}>
            <summary style={summary}>{copy.otherLogin}</summary>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <button onClick={() => setFormMode('invite')} style={secondary}>{copy.familyInvite}</button>
              <button onClick={() => setFormMode('child')} style={secondary}>{copy.childLogin}</button>
              <button onClick={() => setFormMode('shared')} style={secondary}>{copy.sharedLogin}</button>
            </div>
          </details>

          <details style={{ ...details, marginTop: 14 }}>
            <summary style={summary}>{copy.forgotPassword}</summary>
            <p style={{ color: '#8E97A8', fontSize: 12, lineHeight: 1.5, margin: '10px 0' }}>{copy.recoveryBody}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input aria-label={copy.email} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder={copy.email} style={field} />
              <button disabled={recovering || !email.trim()} onClick={() => void sendPasswordRecovery()} style={secondary}>{copy.sendRecovery}</button>
              {recoveryRequested && <>
                <Notice color="#67D391">{copy.recoverySent}</Notice>
                <input aria-label={copy.resetToken} value={resetToken} onChange={(event) => setResetToken(event.target.value)} autoComplete="one-time-code" placeholder={copy.resetToken} style={field} />
                <input aria-label={copy.newPassword} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" placeholder={copy.newPassword} style={field} />
                <button disabled={recovering || !resetToken.trim() || newPassword.length < 10} onClick={() => void finishPasswordRecovery()} style={primary}>{copy.resetPassword}</button>
              </>}
              {recoveryComplete && <Notice color="#67D391">{copy.resetComplete}</Notice>}
              {recoveryError && <Notice color="#ff8f85">{recoveryError}</Notice>}
            </div>
          </details>
        </section>
      </div>
    );
  }

  if (!connected && state.mode === 'adult-account') {
    return (
      <div style={{ width: '100%', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section style={{ ...card, textAlign: 'center', padding: '24px 18px' }}>
          {setup && <StepLabel>{copy.familyStep}</StepLabel>}
          <h1 style={{ margin: '8px 0 0', color: '#F6EBDD', fontSize: 23 }}>{copy.familyTitle}</h1>
          <p style={{ margin: '9px auto 0', color: '#A8B0BF', fontSize: 14, lineHeight: 1.55, maxWidth: 340 }}>{copy.familyBody}</p>
          {state.error && <Notice color="#ff8f85">{copy.errors[state.error as OnlineError]}</Notice>}
        </section>

        <section style={card}>
          {familyMode === 'pick' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ChoiceButton icon="🏠" title={copy.createChoice} sub={copy.createChoiceSub} onClick={() => setFamilyMode('create')} />
            <ChoiceButton icon="👥" title={copy.joinChoice} sub={copy.joinChoiceSub} onClick={() => setFamilyMode('join')} />
          </div>}

          {familyMode === 'create' && <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <button onClick={() => setFamilyMode('pick')} style={backButton}>‹ {copy.back}</button>
            <input aria-label={copy.householdName} value={householdName} onChange={(event) => setHouseholdName(event.target.value)} placeholder={copy.householdName} style={field} autoFocus />
            <div style={{ padding: 13, borderRadius: 12, background: 'rgba(244,185,66,.08)', border: '1px solid rgba(244,185,66,.28)' }}>
              <div style={{ color: '#F4B942', fontSize: 11, fontWeight: 850, textTransform: 'uppercase', letterSpacing: .6 }}>{copy.yourFighter}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                {ownFighter && <FighterChip name={ownFighter.name} color={ownFighter.color} />}
                <span style={{ color: '#8E97A8', fontSize: 11.5 }}>{copy.yourFighterSub}</span>
              </div>
            </div>
            <div style={{ padding: 13, borderRadius: 12, background: '#121827', border: '1px solid #2b3346' }}>
              <div style={{ color: '#D4D9E2', fontSize: 12.5, fontWeight: 800 }}>{copy.otherPlayers}</div>
              <div style={{ color: '#7D8698', fontSize: 11.5, lineHeight: 1.4, marginTop: 3 }}>{copy.otherPlayersSub}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: otherFighters.length ? 11 : 0 }}>
                {otherFighters.map((fighter) => (
                  <div key={fighter.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 9, background: fighter.color }} />
                    <input aria-label={copy.playerName} value={fighter.name} onChange={(event) => gameActions.editFighter(fighter.id, { name: event.target.value })} placeholder={copy.playerName} style={{ ...field, padding: '10px 11px', fontSize: 13 }} />
                    <button onClick={() => gameActions.deleteFighter(fighter.id)} aria-label="Remove" style={{ width: 36, height: 36, flex: 'none', borderRadius: 9, border: '1px solid rgba(224,86,74,.4)', background: '#241518', color: '#ff8f85', fontSize: 19, cursor: 'pointer' }}>×</button>
                  </div>
                ))}
              </div>
              <button onClick={gameActions.addFighter} style={{ ...secondary, marginTop: 11, borderStyle: 'dashed' }}>+ {copy.addPlayer}</button>
            </div>
            <p style={{ margin: 0, color: '#8E97A8', fontSize: 12.5, lineHeight: 1.5 }}>{copy.bootstrapNote}</p>
            {setupError && <Notice color="#ff8f85">{setupError}</Notice>}
            <button disabled={busy || !householdName.trim() || !ownFighter || otherFighters.some((fighter) => !fighter.name.trim())} onClick={createHousehold} style={primary}>{busy ? copy.creating : copy.createHousehold}</button>
          </div>}

          {familyMode === 'join' && <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <button onClick={() => setFamilyMode('pick')} style={backButton}>‹ {copy.back}</button>
            <input aria-label={copy.inviteToken} value={inviteToken} onChange={(event) => setInviteToken(event.target.value)} placeholder={copy.inviteToken} autoCapitalize="characters" style={{ ...field, textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1 }} autoFocus />
            {setupError && <Notice color="#ff8f85">{setupError}</Notice>}
            <button disabled={!inviteToken.trim() || busy} onClick={() => void acceptInvite()} style={primary}>{busy ? copy.joining : copy.acceptInvite}</button>
          </div>}
        </section>

        {sessionManagement}
        {accountErasure}
        <button onClick={() => void actions.logout()} style={secondary}>{copy.logout}</button>
      </div>
    );
  }

  const status = busy
    ? { icon: '↻', text: state.status === 'restoring' ? copy.checking : copy.saving, color: '#8fc0ff' }
    : needsRetry
      ? { icon: '●', text: copy.safeRetry, color: '#F4B942' }
      : { icon: '✓', text: copy.saved, color: '#67D391' };

  return (
    <div style={{ width: '100%', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 48, height: 48, flex: 'none', borderRadius: 14, background: 'rgba(244,185,66,.13)', display: 'grid', placeItems: 'center', fontSize: 23 }}>🏠</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#7D8698', fontSize: 10.5, fontWeight: 850, textTransform: 'uppercase', letterSpacing: .7 }}>{copy.connected}</div>
            <div style={{ color: '#F6EBDD', fontSize: 18, fontWeight: 850, marginTop: 3 }}>{state.householdName || copy.family}</div>
          </div>
        </div>
        <div role="status" aria-live="polite" aria-atomic="true" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14, padding: 11, borderRadius: 11, background: `${status.color}10`, color: status.color }}>
          <span style={{ fontWeight: 900 }}>{status.icon}</span><span style={{ fontSize: 12.5, lineHeight: 1.4, fontWeight: 700 }}>{status.text}</span>
        </div>
        {needsRetry && <button disabled={busy} onClick={() => void synchronize()} style={{ ...primary, marginTop: 11 }}>{copy.retry}</button>}
        {setupError && <Notice color="#ff8f85">{setupError}</Notice>}
      </section>

      <section style={card}>
        <div style={{ fontSize: 12, fontWeight: 850, color: '#7D8698', textTransform: 'uppercase', letterSpacing: .7 }}>{copy.fighters}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 11 }}>
          {gameState.game.fighters.map((fighter) => <FighterChip key={fighter.id} name={fighter.name} color={fighter.color} />)}
        </div>
      </section>

      {state.mode === 'adult-account' && <details style={{ ...card, ...details }}>
        <summary style={summary}>{copy.peopleDevices}</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 13 }}>
          {isParent && <details style={details}>
            <summary style={{ ...summary, fontSize: 13 }}>{copy.inviteParent}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <input aria-label={copy.parentEmail} value={parentEmail} onChange={(event) => setParentEmail(event.target.value)} type="email" placeholder={copy.parentEmail} style={field} />
              <button disabled={!parentEmail.trim() || busy} onClick={() => void createParentInvitation()} style={primary}>{copy.createInvite}</button>
              {parentInviteSentTo && <Notice color="#67D391">{copy.parentInviteSent.replace('{email}', parentInviteSentTo)}</Notice>}
            </div>
          </details>}
          {isParent && <button onClick={() => void createSharedPairing()} style={secondary}>{copy.createSharedCode}</button>}
          {sharedCode && <CodeCard title={copy.sharedCodeTitle} code={sharedCode} button={copied ? copy.copied : copy.copy} onCopy={() => void copySharedCode()} />}
          <details style={details}>
            <summary style={{ ...summary, fontSize: 13 }}>{copy.joinHousehold}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <input aria-label={copy.inviteToken} value={inviteToken} onChange={(event) => setInviteToken(event.target.value)} placeholder={copy.inviteToken} style={field} />
              <button disabled={!inviteToken.trim() || busy} onClick={() => void acceptInvite()} style={primary}>{copy.acceptInvite}</button>
            </div>
          </details>
        </div>
      </details>}

      <details style={{ ...card, ...details }}>
        <summary style={summary}>{copy.advanced}</summary>
        <div style={{ color: '#7D8698', fontSize: 12, lineHeight: 1.65, marginTop: 11 }}>
          {state.pendingMutationCount} {copy.pending}<br />
          {state.rejectedMutationCount > 0 && <><span style={{ color: '#E0564A' }}>{state.rejectedMutationCount} {copy.rejected}</span><br /></>}
          {copy.revision}: {state.configurationRevision}<br />
          {state.lastSuccessfulSyncAt && <>{copy.lastSync}: {new Date(state.lastSuccessfulSyncAt).toLocaleString(lang === 'en' ? 'en-GB' : 'nb-NO')}<br /></>}
          {state.role && <>{copy.role}: {state.role}</>}
        </div>
        <button disabled={busy} onClick={() => void synchronize()} style={{ ...secondary, marginTop: 10 }}>{copy.syncNow}</button>
      </details>

      {isParent && <details style={{ ...card, ...details }}>
        <summary style={summary}>{copy.privacyData}</summary>
        <p style={{ color: '#8E97A8', fontSize: 12.5, lineHeight: 1.5, margin: '11px 0 0' }}>{copy.privacyDataBody}</p>
        <button disabled={exportingData} onClick={() => void downloadFamilyData()} style={{ ...secondary, marginTop: 10 }}>
          {exportingData ? copy.downloadingData : copy.downloadData}
        </button>
        {isOwner && <details style={{ ...details, marginTop: 14, paddingTop: 12, borderTop: '1px solid #3a2428' }}>
          <summary style={{ ...summary, color: '#ff8f85', fontSize: 13 }}>{copy.eraseFamily}</summary>
          <p style={{ color: '#A8B0BF', fontSize: 12, lineHeight: 1.5, margin: '10px 0' }}>{copy.eraseFamilyBody}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input aria-label={copy.confirmFamilyName} value={eraseFamilyName} onChange={(event) => setEraseFamilyName(event.target.value)} placeholder={copy.confirmFamilyName} autoComplete="off" style={field} />
            <input aria-label={copy.currentPassword} value={eraseFamilyPassword} onChange={(event) => setEraseFamilyPassword(event.target.value)} placeholder={copy.currentPassword} type="password" autoComplete="current-password" style={field} />
            <button disabled={erasingFamily || eraseFamilyName.trim() !== state.householdName || !eraseFamilyPassword} onClick={() => void eraseFamilyData()} style={{ ...secondary, color: '#ff8f85', borderColor: '#873f44', opacity: erasingFamily ? .6 : 1 }}>
              {erasingFamily ? copy.erasingFamily : copy.eraseFamilyButton}
            </button>
          </div>
        </details>}
      </details>}

      {sessionManagement}
      {accountErasure}

      <button onClick={() => void actions.logout()} style={secondary}>{copy.logout}</button>
    </div>
  );
}

const backButton: React.CSSProperties = { alignSelf: 'flex-start', padding: '4px 0', border: 'none', background: 'none', color: '#8fc0ff', fontSize: 13, fontWeight: 750, cursor: 'pointer' };

function StepLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ color: '#F4B942', fontSize: 11, fontWeight: 850, textTransform: 'uppercase', letterSpacing: .8 }}>{children}</div>;
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ ...secondary, background: active ? 'rgba(244,185,66,.16)' : '#121827', color: active ? '#F4B942' : '#A8B0BF', borderColor: active ? 'rgba(244,185,66,.4)' : '#333c50' }}>{children}</button>;
}

function ChoiceButton({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick(): void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 15, border: '1px solid #333c50', borderRadius: 15, background: '#121827', color: '#F6EBDD', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 13, background: 'rgba(244,185,66,.12)', display: 'grid', placeItems: 'center', fontSize: 21 }}>{icon}</span>
      <span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 15 }}>{title}</strong><span style={{ display: 'block', color: '#7D8698', fontSize: 12, marginTop: 3 }}>{sub}</span></span>
      <span style={{ color: '#7D8698', fontSize: 22 }}>›</span>
    </button>
  );
}

function FighterChip({ name, color }: { name: string; color: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #333c50', borderRadius: 999, background: '#0f1420', padding: '6px 10px 6px 7px', color: '#D4D9E2', fontSize: 12.5, fontWeight: 750 }}><span style={{ width: 23, height: 23, borderRadius: 999, background: color, color: '#10131b', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 900 }}>{name.trim().charAt(0).toUpperCase() || '?'}</span>{name.trim() || '?'}</span>;
}

function CodeCard({ title, code, button, onCopy }: { title: string; code: string; button: string; onCopy(): void }) {
  return <div style={{ padding: 13, borderRadius: 12, background: 'rgba(91,155,232,.09)', border: '1px solid rgba(91,155,232,.35)' }}><div style={{ color: '#A8B0BF', fontSize: 12, lineHeight: 1.4 }}>{title}</div><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}><strong style={{ flex: 1, color: '#F6EBDD', fontSize: 20, letterSpacing: 2 }}>{code}</strong><button onClick={onCopy} style={{ ...secondary, width: 'auto', padding: '8px 11px', color: '#8fc0ff' }}>{button}</button></div></div>;
}

function Notice({ children, color }: { children: React.ReactNode; color: string }) {
  return <div role="alert" style={{ padding: '10px 12px', borderRadius: 10, background: `${color}12`, border: `1px solid ${color}55`, color, fontSize: 12, lineHeight: 1.45 }}>{children}</div>;
}
