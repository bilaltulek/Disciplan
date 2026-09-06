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
