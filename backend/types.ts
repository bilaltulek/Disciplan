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

export interface EnvironmentConfiguration {
  port: number;
  readonly jwtSecret: string;
  readonly geminiApiKey: string;
  geminiModel: string;
  geminiRouterModel: string;
  geminiAgentModel: string;
  geminiSearchModel: string;
  aiBudgetMonthlyUsd: number;
  aiBudgetHardStopUsd: number;
  aiMaxOutputTokens: number;
  aiThinkingBudget: number;
  aiUserDailyRequestLimit: number;
  aiAgentMaxIterations: number;
  aiAgentMaxModelCalls: number;
  aiAgentMaxToolCalls: number;
  aiAgentMaxSearchCalls: number;
  aiSearchMonthlyRequestLimit: number;
  aiAgentRunMaxReservationUsd: number;
  databaseUrl: string;
  agentDatabaseUrl: string;
  migrationDatabaseUrl: string;
  agentRolloutMode: 'off' | 'shadow' | 'active';
  agentRuntimeScope: 'standard' | 'preview';
  executionRuntime: 'api' | 'trigger';
  triggerProjectRef: string;
  agentExecutionPolicy: any;
  corsOrigins: string[];
  agentWorkerEnabled: boolean;
  agentWorkerPollMs: number;
  agentWorkerMaxAttempts: number;
  cookieSecure: boolean;
  isProduction: boolean;
  workos: WorkosConfiguration;
}

export interface PersistedOAuthState {
  provider: AuthProvider;
  intent: AuthIntent;
  return_path: string;
}
