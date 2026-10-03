import nodemailer from 'npm:nodemailer@6';

// Emails the admin about an app event (new signup, new premium subscriber).
// Best-effort: never throws, so a mail outage can't fail a signup or make
// Stripe retry a webhook. Needs the secrets SMTP_USER and SMTP_PASS (Gmail app
// password, same as the Sunday review email); NOTIFY_TO defaults to SMTP_USER.
export async function notifyAdmin(subject: string, text: string): Promise<void> {
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  if (!user || !pass) {
    console.error('notifyAdmin: SMTP_USER / SMTP_PASS not set, skipping:', subject);
    return;
  }
  try {
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
    await transport.sendMail({ from: user, to: Deno.env.get('NOTIFY_TO') || user, subject, text });
  } catch (err) {
    console.error('notifyAdmin failed:', (err as Error).message);
  }
}
