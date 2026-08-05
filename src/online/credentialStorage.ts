import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const CREDENTIAL_KEY = 'boss-kamp-online-credentials-v1';
let nativeWrite = Promise.resolve();

export interface OnlineCredentials {
  sessionToken: string | null;
  householdDeviceToken: string | null;
}

export function isOnlineCredentials(value: unknown): value is OnlineCredentials {
  if (!value || typeof value !== 'object') return false;
  const credentials = value as Partial<OnlineCredentials>;
  return (credentials.sessionToken === null || typeof credentials.sessionToken === 'string')
    && (credentials.householdDeviceToken === null || typeof credentials.householdDeviceToken === 'string');
}

export function usesNativeCredentialStorage() {
  return Capacitor.isNativePlatform();
}

export function credentialsForPublicStorage(credentials: OnlineCredentials, native: boolean): OnlineCredentials {
  return native ? { sessionToken: null, householdDeviceToken: null } : credentials;
}

export function credentialsToRestore(
  secure: OnlineCredentials | null,
  legacy: OnlineCredentials,
): OnlineCredentials {
  return secure ?? legacy;
}

export async function loadNativeCredentials(): Promise<OnlineCredentials | null> {
  if (!usesNativeCredentialStorage()) return null;
  const raw = await SecureStorage.getItem(CREDENTIAL_KEY);
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as unknown;
  if (!isOnlineCredentials(parsed)) throw new Error('Invalid native credential data');
  return parsed;
}

function enqueueNativeWrite(operation: () => Promise<void>) {
  nativeWrite = nativeWrite.catch(() => undefined).then(operation);
  return nativeWrite;
}

export function saveNativeCredentials(credentials: OnlineCredentials) {
  if (!usesNativeCredentialStorage()) return Promise.resolve();
  return enqueueNativeWrite(async () => {
    if (!credentials.sessionToken && !credentials.householdDeviceToken) {
      await SecureStorage.remove(CREDENTIAL_KEY);
      return;
    }
    await SecureStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credentials));
  });
}

export function clearNativeCredentials() {
  if (!usesNativeCredentialStorage()) return Promise.resolve();
  return enqueueNativeWrite(async () => { await SecureStorage.remove(CREDENTIAL_KEY); });
}
