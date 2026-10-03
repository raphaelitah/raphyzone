import LegalPage, { Section, List } from '@/components/LegalPage';
import { LEGAL } from '@/lib/legal';

const PROCESSORS = [
  ['Supabase', 'Database, user accounts and sign-in emails. Our data is stored in the EU (Ireland).'],
  ['Cloudflare', 'Hosting and delivery of the app.'],
  ['Stripe', 'Payment processing and subscription management. Stripe handles your card details; we never see them.'],
  ['Google', 'Optional "Continue with Google" sign-in, and Gemini AI models that help generate plans.'],
  ['Groq', 'AI models that help generate plans and workout suggestions.'],
  ['Resend', 'Optional email delivery, for example if you ask to be emailed when a plan is ready.'],
  ['YouTube (Google)', 'Exercise videos. A video loads from YouTube only when you open it, and YouTube may then set cookies and collect usage data under its own policy.'],
];

export default function Privacy() {
  const { appName, operator, contactEmail, minAge } = LEGAL;
  return (
    <LegalPage title="Privacy Policy">
      <Section title="1. Who is responsible for your data">
        <p>
          {operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) runs {appName} and decides how your personal data is used. You can reach us
          at <a className="text-primary hover:underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>.
        </p>
      </Section>

      <Section title="2. What we collect">
        <List items={[
          'Account data: your email address, your name if you give one, and your password in hashed form. If you sign in with Google we receive your Google email and name.',
          'Training profile: goals, experience, equipment, schedule, preferred training days and durations, strength calibration, exercises you dislike, units, and similar answers you give during onboarding or in your profile. Some of this can reveal information about your physical condition and is treated with extra care.',
          'Activity data: weekly plans, workout sessions, weights, reps, times, notes, feedback, swaps and progress history.',
          'Content you submit: custom workouts and any free-text notes you write.',
          'Billing data: your Stripe customer and subscription identifiers, plan, status and renewal dates. Card numbers are handled only by Stripe.',
          'Technical data: a sign-in token stored in your browser, and basic server and error logs kept by our providers for security and troubleshooting.',
        ]} />
      </Section>

      <Section title="3. How we use it">
        <List items={[
          'to run the Service: sign you in, save your workouts, build and adjust your plans;',
          'to personalise plans and suggestions, including with AI (see section 4);',
          'to manage free, trial and paid access and to process payments;',
          'to send emails you need, such as sign-in codes, invitations and optional plan-ready notices;',
          'to keep the Service secure, prevent abuse and fix problems;',
          'to improve the Service, using your data in aggregate or de-identified form where possible.',
        ]} />
        <p>We do not sell your personal data and we do not show advertising.</p>
      </Section>

      <Section title="4. AI processing">
        <p>
          When you use AI features, we send a summary of your training profile (such as goals, equipment, schedule,
          strength calibration, dislikes and past swaps), any free-text context you typed, and our workout catalog to AI
          providers (currently Google and Groq) so they can generate plans, swaps and substitutes. We do not send your
          name or email address. Please do not put sensitive details, such as medical diagnoses, in free-text fields.
          AI output may be inaccurate; see our Terms.
        </p>
      </Section>

      <Section title="5. Why we are allowed to use your data (EU/UK users)">
        <List items={[
          'Performing our contract with you: running your account, plans and subscription.',
          'Your consent: for health-related information you choose to give us and for optional emails. You can withdraw consent at any time, which may limit features that depend on that data.',
          'Our legitimate interests: security, preventing abuse, and improving the Service, balanced against your rights.',
          'Legal obligations: for example keeping payment and tax records.',
        ]} />
      </Section>

      <Section title="6. Who we share it with">
        <p>We use these service providers, who process data on our behalf:</p>
        <ul className="space-y-2">
          {PROCESSORS.map(([name, what]) => (
            <li key={name}><span className="font-medium text-foreground">{name}</span> &mdash; {what}</li>
          ))}
        </ul>
        <p>
          We may also disclose data if the law requires it, to protect our rights or users&rsquo; safety, or in a business
          transfer such as a merger or sale, in which case we will tell you.
        </p>
      </Section>

      <Section title="7. International transfers">
        <p>
          Our main database is in the EU, but some providers above are based in or process data in the United States
          and other countries. Where required, we rely on safeguards such as the EU Standard Contractual Clauses or the
          providers&rsquo; participation in the EU&ndash;US Data Privacy Framework.
        </p>
      </Section>

      <Section title="8. How long we keep it">
        <p>
          We keep your data while your account is open. You can delete your account yourself under Profile → Delete
          account, or by emailing us. Deleting removes your profile, plans, workout history, progress and sign-in, and
          cancels any subscription. Workouts or exercises you submitted and we approved into the shared catalog stay
          there without your name; unapproved submissions are deleted. We keep only what we must by law (such as payment
          records held by Stripe), and backups are overwritten in the ordinary course.
        </p>
      </Section>

      <Section title="9. Your rights">
        <p>
          Depending on where you live, you can ask us to access, correct, delete or export your data, to restrict or
          object to certain processing, and to withdraw consent. To use any of these rights, email <a className="text-primary hover:underline" href={`mailto:${contactEmail}`}>{contactEmail}</a> (account deletion is also available in the app). We will respond within the time the law
          requires (generally within one month, or 45 days for US requests). We will not discriminate against you for
          exercising your rights.
        </p>
        <p>
          If you are in the EU or UK, you may complain to your local data-protection authority. California residents
          have rights under the CCPA/CPRA to know, delete and correct their data and to opt out of sale or sharing;
          we do not sell or share personal data for advertising.
        </p>
      </Section>

      <Section title="10. Cookies and similar storage">
        <p>
          We use only what the app needs to work: browser storage that keeps you signed in and remembers small
          preferences (for example your last workout search). We do not use advertising or analytics trackers. Embedded
          YouTube videos may set their own cookies once you play them.
        </p>
      </Section>

      <Section title="11. Security">
        <p>
          Access to data is restricted by account, passwords are hashed, traffic is encrypted, and payment details stay
          with Stripe. No system is completely secure, so we cannot guarantee absolute security.
        </p>
      </Section>

      <Section title="12. Children">
        <p>
          The Service is not for anyone under {minAge}. If you believe a child has given us personal data, contact us and
          we will delete it.
        </p>
      </Section>

      <Section title="13. Changes">
        <p>
          We may update this policy. If the change is material we will notify you in the app or by email before it takes
          effect. The effective date at the top shows when it was last updated.
        </p>
      </Section>
    </LegalPage>
  );
}
