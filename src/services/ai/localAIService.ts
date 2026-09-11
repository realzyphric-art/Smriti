import { errorLogger } from '@/services/errorLogger';
import {
  AIProviderNotConfiguredError,
  type LocalAnalysisProvider,
  type LocalAnalysisRequest,
  type LocalAnalysisResult,
} from './types';

/**
 * LOCAL AI - PLACEHOLDER.
 *
 * No localhost or fixed computer address is assumed. A future adapter should
 * be provided by a server-side route or an explicitly configured local service.
 */
export function createLocalAnalysisProvider(): LocalAnalysisProvider {
  return {
    kind: 'local',
    analyze: async (request: LocalAnalysisRequest): Promise<LocalAnalysisResult> => notConfigured('analyze', request.patientId),
    getStatus: async (jobId: string): Promise<LocalAnalysisResult> => notConfigured('get_status', jobId),
  };
}

function notConfigured(operation: string, _sourceId: string): never {
  const error = new AIProviderNotConfiguredError('local');
  void errorLogger.captureRequestError(error, {
    feature: 'ai.local',
    eventType: 'AI_PROVIDER_NOT_CONFIGURED',
    action: operation,
    errorCode: error.code,
    metadata: { provider: 'local' },
  });
  throw error;
}
