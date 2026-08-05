import { sql } from './db.js';
import { retentionCutoffs, retentionPolicy, type RetentionPolicy } from './retentionPolicy.js';

export async function runOperationalRetention(now = new Date(), policy = retentionPolicy()) {
  const cutoffs = retentionCutoffs(now, policy);
  return sql.begin(async (tx) => {
    const invites = await tx`
      delete from household_invites
      where coalesce(accepted_at, expires_at) < ${cutoffs.invites}
      returning id
    `;
    const pairings = await tx`
      delete from device_pairings
      where coalesce(claimed_at, expires_at) < ${cutoffs.pairings}
      returning id
    `;
    const sessions = await tx`
      delete from sessions
      where coalesce(revoked_at, expires_at) < ${cutoffs.sessions}
        and (revoked_at is not null or expires_at < ${now})
      returning id
    `;
    const passwordResets = await tx`
      delete from password_reset_tokens
      where coalesce(used_at, expires_at) < ${cutoffs.passwordResets}
        and (used_at is not null or expires_at < ${now})
      returning id
    `;
    const emailVerifications = await tx`
      delete from email_verification_tokens
      where coalesce(used_at, expires_at) < ${cutoffs.passwordResets}
        and (used_at is not null or expires_at < ${now})
      returning id
    `;

    const oldDevices = await tx`
      select id from devices where revoked_at < ${cutoffs.devices} for update
    `;
    const oldDeviceIds = oldDevices.map((device) => String(device.id));
    if (oldDeviceIds.length > 0) {
      await tx`update sessions set device_id = null where device_id = any(${oldDeviceIds}::uuid[])`;
      await tx`update chore_completions set performed_by_device_id = null where performed_by_device_id = any(${oldDeviceIds}::uuid[])`;
      await tx`update device_pairings set claimed_device_id = null where claimed_device_id = any(${oldDeviceIds}::uuid[])`;
      await tx`delete from devices where id = any(${oldDeviceIds}::uuid[])`;
    }

    const avatars = await tx`
      delete from fighter_avatars fa
      using fighters f
      where f.id = fa.fighter_id and f.deleted_at < ${cutoffs.deletedAvatars}
      returning fa.fighter_id
    `;

    return {
      invites: invites.length,
      pairings: pairings.length,
      sessions: sessions.length,
      passwordResets: passwordResets.length,
      emailVerifications: emailVerifications.length,
      devices: oldDeviceIds.length,
      deletedFighterAvatars: avatars.length,
    };
  });
}
