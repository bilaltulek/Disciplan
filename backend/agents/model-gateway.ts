import { ChatGoogle } from '@langchain/google';

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export interface ModelGateway {
  readonly provider: string;
  readonly modelName: string;
  createChatModel(): ChatGoogle;
  recordUsage?(input: { role: string; runId: string; actorUserId: number; usage: ModelUsage }): Promise<void>;
}

export type GeminiGatewayConfig = {
  apiKey: string;
  modelName: string;
  maxOutputTokens: number;
  thinkingBudget: number;
  timeoutMs?: number;
  onUsage?: ModelGateway['recordUsage'];
};

export const normalizeGoogleModelError = (error: unknown): Error & { code: string; cause?: unknown } => {
  type ErrorShape = {
    name?: string; statusCode?: number; status?: number; code?: string | number;
    cause?: unknown; error?: unknown; data?: { error?: unknown };
  };
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  const chain: ErrorShape[] = [];
  while (queue.length > 0 && chain.length < 8) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue;
    seen.add(candidate);
    const value = candidate as ErrorShape;
    chain.push(value);
    queue.push(value.cause, value.error, value.data?.error);
  }
  const governed = chain.find((value) => typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(value.code));
  if (governed) {
    if (chain[0] === governed) return error as Error & { code: string };
    return Object.assign(new Error('The model request failed safely.'), { code: governed.code as string, cause: error });
  }
  const names = new Set(chain.map((value) => value.name).filter(Boolean));
  const statusCode = chain.map((value) => value.statusCode ?? value.status ?? (
    typeof value.code === 'number' ? value.code : /^\d{3}$/.test(String(value.code || '')) ? Number(value.code) : undefined
  )).find((value) => typeof value === 'number');
  const code = names.has('PromptBlockedError') || names.has('NoCandidatesError')
    ? 'MODEL_SAFETY_BLOCK'
    : names.has('MalformedOutputError') || names.has('StructuredOutputParsingError') || names.has('ZodError')
      ? 'MODEL_STRUCTURE_INVALID'
      : names.has('AbortError') || statusCode === 408 || statusCode === 504
        ? 'MODEL_TIMEOUT'
        : statusCode === 429
          ? 'MODEL_QUOTA_EXCEEDED'
          : statusCode === 401 || statusCode === 403
            ? 'MODEL_AUTHENTICATION_FAILED'
            : statusCode === 404
              ? 'MODEL_NOT_FOUND'
              : statusCode === 400
                ? 'MODEL_REQUEST_INVALID'
                : typeof statusCode === 'number' && statusCode >= 500
                  ? 'MODEL_UNAVAILABLE'
                  : 'MODEL_UNAVAILABLE';
  return Object.assign(new Error('The model request failed safely.'), { code, statusCode, cause: error });
};

export const buildGeminiModelOptions = (config: GeminiGatewayConfig) => {
  if (config.thinkingBudget > 0 && /^gemini-3(?:\.|-)/.test(config.modelName)) {
    throw Object.assign(new Error('Numeric thinking budgets are not supported by the configured Gemini 3 model.'), {
      code: 'MODEL_THINKING_CONFIG_UNSUPPORTED',
    });
  }
  return {
    apiKey: config.apiKey,
    model: config.modelName,
    maxOutputTokens: config.maxOutputTokens,
    maxRetries: 0,
    ...(config.thinkingBudget > 0
      ? { thinkingConfig: { thinkingBudget: config.thinkingBudget } }
      : {}),
  };
};

export class GeminiModelGateway implements ModelGateway {
  readonly provider = 'gemini';
  readonly modelName: string;

  constructor(private readonly config: GeminiGatewayConfig) {
    this.modelName = config.modelName;
  }

  createChatModel() {
    if (!this.config.apiKey) throw Object.assign(new Error('Gemini is not configured.'), { code: 'MODEL_UNAVAILABLE' });
    return new ChatGoogle(buildGeminiModelOptions(this.config));
  }

  async recordUsage(input: { role: string; runId: string; actorUserId: number; usage: ModelUsage }) {
    await this.config.onUsage?.(input);
  }
}
