import type { Logger } from 'pino';
import type { AuthenticatedUser } from './types.js';

declare global {
  interface Error {
    code?: string;
    issues?: unknown;
    status?: number;
  }

  namespace Express {
    interface Request {
      id: string;
      log?: Logger;
      user?: AuthenticatedUser;
    }
  }
}

export {};
