import nodemailer from 'nodemailer';

export class MailDeliveryError extends Error {
  readonly code = 'mail_delivery_failed';
  readonly statusCode = 502;

  constructor() {
    super('Invitation email could not be delivered');
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
