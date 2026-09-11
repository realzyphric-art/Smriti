/**
 * Provider-neutral contracts for future AI integrations.
 *
 * These types deliberately contain no provider SDK types and no secrets. The
 * browser can use them to model a job, while a Supabase Edge Function or
 * another server-side adapter owns any private provider credentials.
 */

export type AIJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type AIProviderKind = 'video' | 'local';
export type AIHealthStatus = 'operational' | 'degraded' | 'failing' | 'unknown';

export interface AIErrorDetails {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface AIJobReference {
  jobId: string;
  provider: string;
  status: AIJobStatus;
  correlationId: string;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  retryCount: number;
  error?: AIErrorDetails | null;
}

export interface VideoAnalysisRequest {
  videoId: string;
  storagePath: string;
  patientId: string;
  analysisType: string;
  metadata?: Record<string, unknown>;
  correlationId: string;
}

export interface VideoAnalysisResult extends AIJobReference {
  providerKind: 'video';
  analysisId?: string;
  summary?: string | null;
  metrics?: Record<string, unknown>;
  confidence?: number | null;
  timestamps?: Array<Record<string, unknown>>;
}

export interface LocalAnalysisRequest {
  patientId: string;
  period: { from: string; to: string };
  metrics: Record<string, unknown>;
  correlationId: string;
}

export interface LocalAnalysisResult extends AIJobReference {
  providerKind: 'local';
  analysisId?: string;
  summary?: string | null;
  signals?: Array<Record<string, unknown>>;
  recommendations?: Array<Record<string, unknown>>;
}

export interface AIProviderStatus {
  provider: AIProviderKind;
  label: string;
  status: AIHealthStatus;
  checkedAt: string | null;
  detail: string;
}

export interface VideoAnalysisProvider {
  readonly kind: 'video';
  submit(request: VideoAnalysisRequest): Promise<VideoAnalysisResult>;
  getStatus(jobId: string): Promise<VideoAnalysisResult>;
  cancel?(jobId: string): Promise<void>;
}

export interface LocalAnalysisProvider {
  readonly kind: 'local';
  analyze(request: LocalAnalysisRequest): Promise<LocalAnalysisResult>;
  getStatus(jobId: string): Promise<LocalAnalysisResult>;
}

export class AIProviderNotConfiguredError extends Error {
  readonly code = 'AI_PROVIDER_NOT_CONFIGURED';
  readonly retryable = false;

  constructor(readonly provider: AIProviderKind) {
    super(`${provider === 'video' ? 'Video AI' : 'Local AI'} provider is not configured.`);
    this.name = 'AIProviderNotConfiguredError';
  }
}

export function unknownAIProviderStatus(provider: AIProviderKind): AIProviderStatus {
  return {
    provider,
    label: provider === 'video' ? 'Video AI' : 'Local AI',
    status: 'unknown',
    checkedAt: null,
    detail: 'No provider health check is configured.',
  };
}
