import { Link } from 'react-router-dom';
import PublicAuthLayout from '@/components/layout/PublicAuthLayout';

type LegalDocument = 'privacy' | 'terms';

interface LegalPageProps { document: LegalDocument; }

const legalCopy = {
  terms: {
    title: 'Terms of Service',
    description: 'The rules for using Disciplan.',
    sections: [
      ['Eligibility', 'You must be at least 13 years old to create a Disciplan account. If local law requires parental or guardian consent, you are responsible for obtaining it.'],
      ['Your account', 'Keep your account information accurate and your credentials secure. You are responsible for activity performed through your account.'],
      ['Using Disciplan', 'Disciplan is an educational planning tool. Generated schedules and study suggestions are informational and do not guarantee academic outcomes. Do not misuse the service, interfere with it, or use it to violate another person’s rights.'],
      ['Availability and changes', 'Features may evolve as the service develops. Material changes to these terms will be accompanied by an updated effective date before these terms are approved for provider sign-in.'],
      ['Contact and legal review', 'The service operator’s legal identity, governing terms, contact details, and effective date must be completed and reviewed before third-party provider sign-in is enabled publicly.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    description: 'How Disciplan handles account and study-planning data.',
    sections: [
      ['Information collected', 'Disciplan processes account details such as your name and email, along with assignments, tasks, settings, and conversations you choose to create in the service.'],
      ['How information is used', 'This information is used to provide authentication, generate and manage study plans, maintain your settings, secure the service, and diagnose reliability issues.'],
      ['Service providers', 'Disciplan relies on infrastructure, database, AI, and—when enabled—identity providers to operate the service. Provider access is limited to the information needed for those functions.'],
      ['Retention and control', 'Account data is retained while the account is active and as needed for security and legal obligations. Available account controls can be used to update profile information or request account deletion.'],
      ['Contact and legal review', 'The service operator’s identity, privacy contact, data-retention details, applicable rights, and effective date must be completed and reviewed before third-party provider sign-in is enabled publicly.'],
    ],
  },
} as const;

const LegalPage = ({ document }: LegalPageProps) => {
  const copy = legalCopy[document];
  return (
    <PublicAuthLayout title={copy.title} description={copy.description} width="document">
      <article className="public-legal">
        <p className="public-legal-status">Draft for owner and legal review</p>
        <div className="public-legal-content">
          {copy.sections.map(([heading, body]) => (
            <section key={heading}>
              <h2>{heading}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <Link className="public-legal-back" to="/">Back to Disciplan</Link>
      </article>
    </PublicAuthLayout>
  );
};

export default LegalPage;
