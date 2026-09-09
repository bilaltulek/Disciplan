import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface QueryExecutor {
  query<Result extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Result>>;
}

export interface TransactionalDatabase extends QueryExecutor {
  connect(): Promise<PoolClient>;
}

export type DatabasePool = Pick<Pool, 'connect' | 'query' | 'end'>;

export interface AuthenticatedUser {
  id: number;
  email?: string;
}

export interface ApplicationError extends Error {
  code?: string;
  issues?: unknown;
  status?: number;
}

export type AuthProvider = 'google' | 'microsoft' | 'sso';
export type AuthIntent = 'login' | 'signup';

export interface WorkosConfiguration {
  apiKey: string;
  clientId: string;
  redirectUri: string;
  redirectUriValid: boolean;
  enabled: Record<AuthProvider, boolean>;
}

export interface PersistedOAuthState {
  provider: AuthProvider;
  intent: AuthIntent;
  return_path: string;
}
