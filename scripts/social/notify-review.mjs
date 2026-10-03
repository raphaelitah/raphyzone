// Sunday email: link to the review page plus a count of what is waiting.
//   node scripts/social/notify-review.mjs [--dry]
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_USER, SMTP_PASS (Gmail app password).
import nodemailer from 'nodemailer';
import { getServiceClient } from './lib/env.mjs';

const dry = process.argv.includes('--dry');
const REVIEW_URL = process.env.REVIEW_URL || 'https://raphyzone.pages.dev/admin-social';
const to = process.env.NOTIFY_TO || process.env.SMTP_USER;

const { data: posts, error } = await getServiceClient().from('social_posts')
  .select('status, render_status, scheduled_date').in('status', ['draft', 'redo', 'approved']);
if (error) throw error;

const ready = posts.filter((p) => p.status === 'draft' && p.render_status === 'rendered').length;
const unrendered = posts.filter((p) => p.status === 'draft' && p.render_status !== 'rendered').length;
const approved = posts.filter((p) => p.status === 'approved').length;

const subject = ready ? `${ready} Instagram posts ready to review` : 'Instagram review: nothing ready yet';
const text = [
  REVIEW_URL, '',
  `Ready to review: ${ready}`,
  `Drafts not rendered yet: ${unrendered}${unrendered ? ' (check the Instagram renderer workflow)' : ''}`,
  `Already approved, waiting to publish: ${approved}`,
].join('\n');

console.log(`${subject}\n${text}`);
if (dry) process.exit(0);

const transport = nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 465, secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
await transport.sendMail({ from: process.env.SMTP_USER, to, subject, text });
console.log(`Sent to ${to}`);
