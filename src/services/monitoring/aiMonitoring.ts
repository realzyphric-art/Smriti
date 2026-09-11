import { errorLogger } from '@/services/errorLogger';
import { unknownAIProviderStatus, type AIProviderKind, type AIProviderStatus } from '@/services/ai/types';

/** Safe shared monitoring hooks for future AI adapters. */
export function recordAIProviderFailure(provider: AIProviderKind, action: string, error: unknown, metadata?: Record<string, unknown>): void {
  void errorLogger.captureRequestError(error, {
    feature: `ai.${provider}`,
    eventType: 'AI_PROVIDER_REQUEST_FAILED',
    action,
    metadata: { provider, ...metadata },
  });
}

export function getUnconfiguredAIStatuses(): AIProviderStatus[] {
  return [unknownAIProviderStatus('video'), unknownAIProviderStatus('local')];
}
