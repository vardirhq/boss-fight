import nodemailer from 'nodemailer';

export class MailDeliveryError extends Error {
  readonly code = 'mail_delivery_failed';
  readonly statusCode = 502;

  constructor() {
    super('Email could not be delivered');
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function transporter() {
  const host = process.env.SMTP_HOST;
  if (!host) throw new MailDeliveryError();
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function sendHouseholdInviteEmail(input: {
  to: string;
  householdName: string;
  inviterName: string;
  inviteToken: string;
  expiresAt: Date;
}) {
  const from = process.env.SMTP_FROM ?? 'Boss Kamp <chris@vardir.no>';
  const replyTo = process.env.SMTP_REPLY_TO ?? 'chris@vardir.no';
  const householdName = escapeHtml(input.householdName);
  const inviterName = escapeHtml(input.inviterName);
  const inviteToken = escapeHtml(input.inviteToken);
  const expires = input.expiresAt.toLocaleDateString('nb-NO', {
    timeZone: 'Europe/Oslo', day: 'numeric', month: 'long', year: 'numeric',
  });

  try {
    await transporter().sendMail({
      from,
      replyTo,
      to: input.to,
      subject: `${input.inviterName} inviterer deg til ${input.householdName} i Boss Kamp`,
      text: [
        `${input.inviterName} har invitert deg til husholdningen «${input.householdName}» i Boss Kamp.`,
        '',
        `Invitasjonskode: ${input.inviteToken}`,
        '',
        'Åpne Boss Kamp, velg «Bli med i en familie», og logg inn eller opprett en konto med denne e-postadressen.',
        `Invitasjonen gjelder til ${expires}.`,
      ].join('\n'),
      html: `
        <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#182033">
          <div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:#b27b12">BOSS KAMP</div>
          <h1 style="font-size:25px;line-height:1.25;margin:18px 0 10px">Du er invitert til ${householdName}</h1>
          <p style="font-size:16px;line-height:1.6;color:#4a5365"><strong>${inviterName}</strong> vil ha deg med i familiens Boss Kamp.</p>
          <div style="margin:24px 0;padding:20px;border-radius:14px;background:#f3f5f8;text-align:center">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#747d8e">Invitasjonskode</div>
            <div style="margin-top:9px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:20px;font-weight:800;line-height:1.45;overflow-wrap:anywhere;color:#182033">${inviteToken}</div>
          </div>
          <p style="font-size:15px;line-height:1.6;color:#4a5365">Åpne Boss Kamp, velg <strong>«Bli med i en familie»</strong>, og logg inn eller opprett en konto med denne e-postadressen.</p>
          <p style="font-size:13px;line-height:1.5;color:#7a8394">Invitasjonen gjelder til ${expires}.</p>
        </div>`,
    });
  } catch {
    throw new MailDeliveryError();
  }
}

export async function sendPasswordResetEmail(input: {
  to: string;
  displayName: string;
  resetToken: string;
  expiresAt: Date;
}) {
  const from = process.env.SMTP_FROM ?? 'Boss Kamp <chris@vardir.no>';
  const replyTo = process.env.SMTP_REPLY_TO ?? 'chris@vardir.no';
  const displayName = escapeHtml(input.displayName);
  const resetToken = escapeHtml(input.resetToken);
  const expires = input.expiresAt.toLocaleTimeString('nb-NO', {
    timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit',
  });

  try {
    await transporter().sendMail({
      from,
      replyTo,
      to: input.to,
      subject: 'Tilbakestill passordet ditt i Boss Kamp',
      text: [
        `Hei ${input.displayName},`, '',
        'Bruk denne engangskoden for å velge et nytt passord i Boss Kamp:', '',
        input.resetToken, '',
        `Koden gjelder til ${expires}. Hvis du ikke ba om dette, kan du ignorere e-posten.`,
      ].join('\n'),
      html: `
        <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#182033">
          <div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:#b27b12">BOSS KAMP</div>
          <h1 style="font-size:25px;line-height:1.25;margin:18px 0 10px">Velg et nytt passord</h1>
          <p style="font-size:16px;line-height:1.6;color:#4a5365">Hei ${displayName}. Lim inn denne engangskoden i Boss Kamp:</p>
          <div style="margin:24px 0;padding:20px;border-radius:14px;background:#f3f5f8;text-align:center;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:18px;font-weight:800;overflow-wrap:anywhere">${resetToken}</div>
          <p style="font-size:13px;line-height:1.5;color:#7a8394">Koden gjelder til ${expires}. Hvis du ikke ba om dette, kan du ignorere e-posten.</p>
        </div>`,
    });
  } catch {
    throw new MailDeliveryError();
  }
}

export async function sendEmailVerification(input: { to: string; displayName: string; token: string; expiresAt: Date }) {
  const from = process.env.SMTP_FROM ?? 'Boss Kamp <chris@vardir.no>';
  const replyTo = process.env.SMTP_REPLY_TO ?? 'chris@vardir.no';
  const name = escapeHtml(input.displayName);
  const token = escapeHtml(input.token);
  try {
    await transporter().sendMail({
      from, replyTo, to: input.to, subject: 'Bekreft e-postadressen din i Boss Kamp',
      text: [`Hei ${input.displayName},`, '', 'Bruk denne engangskoden for å bekrefte e-postadressen din:', '', input.token, '', 'Koden gjelder i 24 timer.'].join('\n'),
      html: `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:28px;color:#182033"><div style="font-size:13px;font-weight:800;color:#b27b12">BOSS KAMP</div><h1>Bekreft e-postadressen din</h1><p>Hei ${name}. Lim inn denne engangskoden i Boss Kamp:</p><div style="margin:24px 0;padding:20px;border-radius:14px;background:#f3f5f8;text-align:center;font-family:monospace;font-size:18px;font-weight:800;overflow-wrap:anywhere">${token}</div><p>Koden gjelder i 24 timer.</p></div>`,
    });
  } catch { throw new MailDeliveryError(); }
}
