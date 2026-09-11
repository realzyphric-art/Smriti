import { describe, expect, it } from 'vitest';
import { createLocalAnalysisProvider } from '@/services/ai/localAIService';
import { createVideoAnalysisProvider } from '@/services/ai/videoAIService';
import { AIProviderNotConfiguredError, unknownAIProviderStatus } from '@/services/ai/types';

describe('AI placeholders', () => {
  it('fails clearly without sending a Local AI request', async () => {
    await expect(createLocalAnalysisProvider().analyze({
      patientId: 'patient-test',
      period: { from: '2026-01-01', to: '2026-01-31' },
      metrics: {},
      correlationId: 'request-test',
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_NOT_CONFIGURED', provider: 'local' });
  });

  it('fails clearly without sending a Video AI request', async () => {
    await expect(createVideoAnalysisProvider().submit({
      videoId: 'video-test',
      storagePath: 'patient-test/videos/example.mp4',
      patientId: 'patient-test',
      analysisType: 'engagement',
      correlationId: 'request-test',
    })).rejects.toBeInstanceOf(AIProviderNotConfiguredError);
  });

  it('reports unknown health until a real provider check exists', () => {
    expect(unknownAIProviderStatus('video')).toMatchObject({
      provider: 'video',
      status: 'unknown',
      checkedAt: null,
    });
  });
});
