import { Link } from 'react-router-dom';
import PublicAuthLayout from '@/components/layout/PublicAuthLayout';

type LegalDocument = 'privacy' | 'terms';

interface LegalPageProps { document: LegalDocument; }

const EFFECTIVE_DATE = 'September 8, 2026';
const SUPPORT_EMAIL = 'disciplansupport@gmail.com';

const legalCopy = {
  terms: {
    title: 'Terms of Service',
    description: 'The rules for using Disciplan.',
    sections: [
      {
        heading: 'Agreement and operator',
        paragraphs: [
          `These Terms of Service are effective ${EFFECTIVE_DATE}. Disciplan is operated by Bilal Tulek in Texas, United States. By creating an account or using Disciplan, you agree to these terms and the Privacy Policy. If you do not agree, do not use the service.`,
        ],
      },
      {
        heading: 'Eligibility',
        paragraphs: [
          'You must be at least 13 years old to use Disciplan. If the law where you live requires consent from a parent or guardian, you may use the service only after obtaining that consent. Disciplan is not directed to children under 13, and accounts known to belong to children under 13 will be removed.',
        ],
      },
      {
        heading: 'Your account',
        paragraphs: [
          'You must provide accurate account information, keep your credentials secure, and promptly notify us if you believe your account has been compromised. You are responsible for activity through your account. You may use email and password authentication or an enabled third-party identity provider.',
        ],
      },
      {
        heading: 'The beta service',
        paragraphs: [
          'Disciplan is a beta educational planning service. Features may change, be interrupted, contain errors, or be discontinued. We may impose reasonable usage limits or restrict access when necessary to protect users, control costs, comply with law, or maintain the service.',
          'Study plans, schedules, tutoring responses, and other generated content are informational aids. They may be incomplete or inaccurate and do not replace your own judgment, course instructions, teacher guidance, or professional advice. Disciplan does not guarantee grades, deadlines, or academic outcomes.',
        ],
      },
      {
        heading: 'Your content',
        paragraphs: [
          'You retain ownership of the assignments, messages, and other content you submit. You give Disciplan a limited, non-exclusive license to host, process, reproduce, and transmit that content only as needed to provide, secure, maintain, and improve the service. You represent that you have the right to submit your content and that it does not violate law or another person\'s rights.',
        ],
      },
      {
        heading: 'Acceptable use',
        paragraphs: [
          'Do not use Disciplan to break the law; infringe intellectual-property, privacy, or other rights; harass or harm others; submit malware; probe or bypass security or usage limits; scrape the service; access another person\'s account or data; or interfere with the service. Do not submit highly sensitive information that is unnecessary for study planning.',
        ],
      },
      {
        heading: 'Third-party services',
        paragraphs: [
          'Disciplan relies on hosting, database, workflow, artificial-intelligence, and identity providers. Their services may be subject to their own terms and privacy practices. We are not responsible for third-party services outside our reasonable control, but we limit their access to what is needed to operate Disciplan.',
        ],
      },
      {
        heading: 'Suspension and termination',
        paragraphs: [
          'You may stop using Disciplan and request account deletion at any time. We may suspend or terminate access when reasonably necessary for security, legal compliance, prolonged service discontinuation, or a material violation of these terms. Provisions that logically survive termination, including ownership, disclaimers, and limitations of liability, will remain in effect.',
        ],
      },
      {
        heading: 'Disclaimers and liability',
        paragraphs: [
          'To the fullest extent permitted by law, Disciplan is provided “as is” and “as available,” without warranties of merchantability, fitness for a particular purpose, non-infringement, uninterrupted availability, or error-free operation.',
          'To the fullest extent permitted by law, Bilal Tulek and Disciplan will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost data, lost opportunities, or academic outcomes arising from the service. Nothing in these terms excludes liability that cannot legally be excluded.',
        ],
      },
      {
        heading: 'Changes and governing law',
        paragraphs: [
          'We may update these terms as the beta evolves. Material changes will be posted with a revised effective date, and additional notice will be provided when required by law. Continued use after an update takes effect constitutes acceptance of the revised terms.',
          'These terms are governed by the laws of the State of Texas and applicable United States federal law, without regard to conflict-of-law rules. Any dispute that cannot be resolved informally will be handled in a court with lawful jurisdiction in Texas, unless applicable consumer law requires otherwise.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`Questions about these terms may be sent to Bilal Tulek at ${SUPPORT_EMAIL}.`],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    description: 'How Disciplan handles account and study-planning data.',
    sections: [
      {
        heading: 'Scope and operator',
        paragraphs: [
          `This Privacy Policy is effective ${EFFECTIVE_DATE} and applies to Disciplan, a beta service operated by Bilal Tulek in Texas, United States. It explains what personal data Disciplan processes, why it is processed, when it is disclosed, and the choices available to you.`,
        ],
      },
      {
        heading: 'Information collected',
        paragraphs: [
          'Account data includes your name, email address, password hash when you use password authentication, provider identity and verified-email status when you use Google, Microsoft, or enterprise SSO, and your account preferences.',
          'Study-planning data includes assignments, deadlines, difficulty and workload details, generated plans and tasks, completion history, schedule changes, planning preferences, Assistant conversations, feedback, and content you intentionally provide to the service.',
          'Technical data may include IP address, browser and device information, timestamps, session and security events, request identifiers, errors, and limited diagnostic logs. Disciplan uses essential session and security cookies and stores your public-site theme preference locally in your browser.',
        ],
      },
      {
        heading: 'How information is used',
        paragraphs: [
          'We use personal data to create and authenticate accounts; generate, display, revise, and track study plans; provide Assistant and tutoring features; remember settings you choose; prevent abuse; enforce usage and cost limits; secure and troubleshoot the service; respond to requests; and comply with legal obligations.',
          'Disciplan does not sell personal data, use student data for advertising, or process personal data for targeted advertising. Disciplan does not use personal data to make decisions about education enrollment, employment, credit, housing, insurance, health care, or access to essential services.',
        ],
      },
      {
        heading: 'AI processing',
        paragraphs: [
          'When you request AI-assisted planning, tutoring, or revisions, the relevant assignment details, conversation content, preferences, and limited context are sent to contracted AI and workflow providers so they can return the requested result. Do not include sensitive personal information that is unnecessary for the request. Generated results are validated and subject to application safeguards before publication where the product requires approval.',
        ],
      },
      {
        heading: 'Service providers and disclosures',
        paragraphs: [
          'Disciplan uses service providers for hosting and delivery, managed databases, workflow execution, AI processing, identity management, and social or enterprise authentication. These currently include Vercel, Neon, Trigger.dev, Google, WorkOS, and Microsoft where relevant to the feature you select.',
          'We disclose data to these providers only as reasonably necessary to operate, secure, or support Disciplan. We may also disclose information when required by law, to protect users or the service, or as part of a business transfer subject to appropriate confidentiality and notice. We do not disclose personal data to data brokers.',
        ],
      },
      {
        heading: 'Authentication and provider data',
        paragraphs: [
          'If you choose Google, Microsoft, or enterprise SSO, Disciplan requests only the identity information needed to authenticate you, such as your name, email address, verified-email status, and provider user identifier. Disciplan does not store Google or Microsoft provider access tokens. WorkOS processes the authentication exchange and Disciplan then issues its own essential session cookie.',
        ],
      },
      {
        heading: 'Retention and deletion',
        paragraphs: [
          'Account and study-planning data is retained while your account is active and as needed to provide the service. When you delete your account or an authenticated deletion request is completed, active account data is deleted or deidentified, subject to limited retention needed for security, fraud prevention, legal compliance, dispute resolution, and ordinary backup expiration.',
          'Security records, rate-limit records, transaction logs, and backups are retained only for as long as reasonably necessary for their purpose and are then deleted, deidentified, or allowed to expire under the applicable provider\'s controlled retention cycle.',
        ],
      },
      {
        heading: 'Your choices and privacy rights',
        paragraphs: [
          `You may update profile information in Disciplan or email ${SUPPORT_EMAIL} to request access, correction, deletion, or a portable copy of personal data associated with your account. We may need to verify your identity before acting. We will respond within the period required by applicable law and will not discriminate against you for exercising a privacy right.`,
          `Disciplan does not sell personal data or use it for targeted advertising, so there is no sale or targeted-advertising opt-out required for current processing. If we deny a privacy request, you may appeal by replying to the decision or emailing ${SUPPORT_EMAIL} with “Privacy Appeal” in the subject. Texas residents may also contact the Texas Attorney General about unresolved concerns.`,
        ],
      },
      {
        heading: 'Children',
        paragraphs: [
          `Disciplan is not directed to children under 13 and does not knowingly collect personal data from them. If you believe a child under 13 has provided personal data, contact ${SUPPORT_EMAIL}; after appropriate verification, we will remove the account and associated data.`,
        ],
      },
      {
        heading: 'Security and international processing',
        paragraphs: [
          'Disciplan uses reasonable administrative, technical, and organizational measures designed to protect personal data, including restricted access, encrypted network transport, hashed passwords, secure session cookies, and provider-secret controls. No system can guarantee absolute security.',
          'Disciplan is operated from the United States. Service providers may process data in the United States or other locations where they operate, subject to their contractual and legal safeguards.',
        ],
      },
      {
        heading: 'Changes and contact',
        paragraphs: [
          `We may update this policy as Disciplan changes. Material changes will be posted with a revised effective date and additional notice where required. Privacy questions and requests may be sent to Bilal Tulek at ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
} as const;

const LegalPage = ({ document }: LegalPageProps) => {
  const copy = legalCopy[document];
  const relatedDocument = document === 'terms'
    ? { to: '/privacy', label: 'Privacy Policy' }
    : { to: '/terms', label: 'Terms of Service' };

  return (
    <PublicAuthLayout title={copy.title} description={copy.description} width="document">
      <article className="public-legal">
        <p className="public-legal-status">Effective {EFFECTIVE_DATE}</p>
        <div className="public-legal-content">
          {copy.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
        </div>
        <nav className="public-legal-actions" aria-label="Legal document links">
          <Link className="public-legal-back" to={relatedDocument.to}>{relatedDocument.label}</Link>
          <a className="public-legal-back" href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
          <Link className="public-legal-back" to="/">Back to Disciplan</Link>
        </nav>
      </article>
    </PublicAuthLayout>
  );
};

export default LegalPage;
