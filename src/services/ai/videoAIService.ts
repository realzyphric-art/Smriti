import { errorLogger } from '@/services/errorLogger';
import {
  AIProviderNotConfiguredError,
  type VideoAnalysisProvider,
  type VideoAnalysisRequest,
  type VideoAnalysisResult,
} from './types';

/**
 * VIDEO AI - PLACEHOLDER.
 *
 * This adapter intentionally performs no network request. A future server-side
 * implementation should replace the methods below or wrap this interface from
 * a Supabase Edge Function that owns VIDEO_AI_API_KEY.
 */
export function createVideoAnalysisProvider(): VideoAnalysisProvider {
  return {
    kind: 'video',
    submit: async (request: VideoAnalysisRequest): Promise<VideoAnalysisResult> => notConfigured('submit', request.videoId),
    getStatus: async (jobId: string): Promise<VideoAnalysisResult> => notConfigured('get_status', jobId),
    cancel: async (jobId: string): Promise<void> => notConfigured('cancel', jobId),
  };
}

function notConfigured(operation: string, _sourceId: string): never {
  const error = new AIProviderNotConfiguredError('video');
  void errorLogger.captureRequestError(error, {
    feature: 'ai.video',
    eventType: 'AI_PROVIDER_NOT_CONFIGURED',
    action: operation,
    errorCode: error.code,
    metadata: { provider: 'video' },
  });
  throw error;
}
