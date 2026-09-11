import type { AIProvider, ChatMessage } from '@/types';

interface ChatRequest {
  apiKey: string;
  provider: AIProvider;
  model: string;
  messages: ChatMessage[];
  testOnly?: boolean;
}

interface ChatResponse {
  content?: string;
  ok?: boolean;
  error?: string;
}

export async function requestAIChat(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: request.apiKey,
      provider: request.provider,
      model: request.model,
      messages: request.messages.map(({ role, content }) => ({ role, content })),
      testOnly: request.testOnly === true,
    }),
  });

  let payload: ChatResponse = {};
  try { payload = await response.json() as ChatResponse; } catch { /* use the safe fallback below */ }
  if (!response.ok) throw new Error(payload.error || 'The AI request could not be completed.');
  return payload;
}
