import LegalPage, { Section, List } from '@/components/LegalPage';
import { LEGAL } from '@/lib/legal';
import { PRICING } from '@/lib/pricing';

export default function Terms() {
  const { appName, operator, contactEmail, governingLaw, minAge } = LEGAL;
  return (
    <LegalPage title="Terms of Service">
      <Section title="1. Who we are and what these terms cover">
        <p>
          {appName} (the &ldquo;Service&rdquo;) is a workout planning and tracking app operated by {operator}
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using the Service you agree to these terms and to our
          Privacy Policy. If you do not agree, do not use the Service.
        </p>
      </Section>

      <Section title="2. Eligibility and your account">
        <p>
          You must be at least {minAge} years old to use the Service. You are responsible for keeping your login
          credentials secure and for everything that happens under your account. Give us accurate information and
          tell us at {contactEmail} if you believe your account has been compromised.
        </p>
      </Section>

      <Section title="3. Health and fitness disclaimer">
        <p>
          The Service provides general fitness information and training plans. It is not medical advice and is not a
          substitute for a doctor, physiotherapist or qualified coach. Talk to a healthcare professional before
          starting any exercise program, especially if you have an injury, a medical condition, are pregnant, or have
          been inactive for a long time.
        </p>
        <p>
          Exercise carries a risk of injury. You choose to do the workouts at your own risk. Use weights and equipment
          you can handle safely, stop if you feel pain, dizziness or discomfort, and do not rely on suggested loads
          without judging them against how you feel.
        </p>
      </Section>

      <Section title="4. AI-generated content">
        <p>
          Weekly plans, workout swaps, exercise substitutions and weight suggestions are produced with the help of
          automated AI systems and your own training data. They can be wrong, incomplete or unsuitable for you. You
          are responsible for reviewing them and for deciding whether to follow them.
        </p>
      </Section>

      <Section title="5. Free and Premium plans">
        <p>
          The Service has a free plan and a paid Premium plan. New accounts receive a free trial of Premium; the
          length of the trial is shown in the app and may change for future sign-ups. The free plan includes a selection
          of workouts and a limited monthly number of AI actions. Premium includes the full workout library and
          unlimited AI features. We may change what each plan includes, but will not remove access you have already
          paid for during the current billing period.
        </p>
      </Section>

      <Section title="6. Subscriptions, billing and cancellation">
        <List items={[
          `Premium is available as a monthly subscription (currently ${PRICING.currency}${PRICING.month.amount} per month) or an annual subscription (currently ${PRICING.currency}${PRICING.year.amount} per year). The price shown at checkout is the price you pay.`,
          'Subscriptions renew automatically at the end of each period until you cancel. You authorise us, through our payment processor, to charge your payment method each period.',
          'Payments are processed by Stripe. We never see or store your full card details.',
          'You can cancel at any time from Profile → Plan → Manage. Cancellation takes effect at the end of the current paid period, and you keep Premium until then.',
          'Except where the law gives you a right to a refund, payments are non-refundable and we do not refund partial periods.',
          'If a payment fails we may retry it and, if it keeps failing, end your Premium access.',
          'We may change prices with reasonable advance notice. The new price applies from your next renewal, and you may cancel before then.',
          'Prices may exclude taxes. Where applicable, taxes are added or included as shown at checkout.',
        ]} />
      </Section>

      <Section title="7. Content you submit">
        <p>
          You keep ownership of the workouts, notes and other content you submit. By submitting a workout for review you
          give us a worldwide, non-exclusive, royalty-free licence to host, review, edit and, if we approve it, show it
          to other users of the Service. You promise that you have the right to submit it and that it does not infringe
          anyone&rsquo;s rights. We may reject or remove submissions at our discretion. If you delete your account, workouts and exercises you submitted that we had not approved are deleted, and approved ones may stay in the shared catalog without your name.
        </p>
      </Section>

      <Section title="8. Acceptable use">
        <p>You agree not to:</p>
        <List items={[
          'use the Service for anything unlawful or to harm others;',
          'attempt to access other users’ data, or probe, disrupt or overload the Service;',
          'copy, scrape or resell the workout catalog or other content in bulk;',
          'bypass the free-plan limits or access controls, or share your account to avoid paying;',
          'upload content that is unlawful, abusive, misleading or that infringes others’ rights.',
        ]} />
      </Section>

      <Section title="9. Our content and intellectual property">
        <p>
          The Service, including its software, design, workout catalog and exercise library, belongs to us or our
          licensors and is protected by intellectual-property laws. We give you a personal, non-exclusive,
          non-transferable licence to use the Service for your own training for as long as these terms apply.
        </p>
      </Section>

      <Section title="10. Third-party services">
        <p>
          The Service relies on third parties such as hosting, authentication, payment, AI and video providers. Their
          availability and terms are outside our control, and some links or embedded videos lead to services with their
          own terms.
        </p>
      </Section>

      <Section title="11. Suspension, termination and deleting your account">
        <p>
          You can stop using the Service at any time. To delete your account and data, use Profile → Delete account in the app, or email {contactEmail}. We may
          suspend or end your access if you break these terms or misuse the Service. Sections that by their nature should
          survive termination (such as ownership, disclaimers and liability limits) will survive.
        </p>
      </Section>

      <Section title="12. Disclaimers">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent permitted by law we
          disclaim all warranties, express or implied, including fitness for a particular purpose, and we do not
          promise that the Service will be uninterrupted, error-free or that any plan will produce particular results.
        </p>
      </Section>

      <Section title="13. Limitation of liability">
        <p>
          To the fullest extent permitted by law, we are not liable for indirect, incidental, special or consequential
          damages, or for loss of data, profits or goodwill, arising from your use of the Service, including any
          injury that results from exercise. Our total liability for any claim relating to the Service is limited to the
          greater of the amount you paid us in the 12 months before the claim and 50 US dollars. Nothing in these terms
          excludes liability that cannot be excluded by law, such as for fraud or for death or personal injury caused by
          our negligence where the law does not allow that exclusion.
        </p>
        <p>
          If you are a consumer, you keep the mandatory consumer-protection rights of the country where you live.
        </p>
      </Section>

      <Section title="14. Changes to the Service and these terms">
        <p>
          We may update the Service and these terms. If we make a material change we will tell you in the app or by
          email. Using the Service after a change takes effect means you accept the updated terms.
        </p>
      </Section>

      <Section title="15. Governing law">
        <p>
          These terms are governed by the laws of {governingLaw}, without regard to conflict-of-law rules, and
          disputes will be handled by the courts located there, except where mandatory consumer law gives you the right
          to bring a claim in the courts of your own country.
        </p>
      </Section>

      <Section title="16. Contact">
        <p>
          Questions about these terms: <a className="text-primary hover:underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
