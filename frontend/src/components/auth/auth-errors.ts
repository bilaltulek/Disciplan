const messages: Record<string, string> = {
  state_invalid: 'That sign-in attempt expired or was already used. Please try again.',
  provider_unavailable: 'That sign-in option is not currently available.',
  provider_failed: 'The identity provider could not complete sign-in. Please try again.',
  provider_mismatch: 'The selected identity provider did not match the completed sign-in.',
  email_unverified: 'Verify your provider email before signing in to Disciplan.',
  account_not_found: 'No Disciplan account uses that identity. Create an account first.',
  account_link_required: 'An account already uses that email. Log in with your password before connecting a provider.',
  account_conflict: 'That identity could not be connected. Log in another way or try again.',
};

export const authErrorMessage = (code: string | null) => (code ? messages[code] || messages.provider_failed : '');
