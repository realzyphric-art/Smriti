type ChatRole = 'user' | 'assistant';
type Provider = 'openai' | 'qwen' | 'openrouter';

const SMRITI_SYSTEM_PROMPT = [
  'You are Smriti, a calm and supportive companion for people who may have memory difficulties.',
  'Speak gently and respectfully using short, clear sentences and familiar words.',
  'Ask no more than one question at a time. Keep replies focused and avoid jargon, pressure, and overwhelming lists.',
  'Offer reassurance without pretending to be a doctor, therapist, caregiver, or human friend.',
  'Do not diagnose or give medical instructions. For urgent safety or health concerns, encourage contacting a trusted caregiver or local emergency service.',
  'Be patient, non-judgmental, and repeat or rephrase information when helpful.',
].join(' ');

interface IncomingMessage {
  role: ChatRole;
  content: string;
}

interface ChatRequestBody {
  apiKey?: unknown;
  provider?: unknown;
  model?: unknown;
  messages?: unknown;
  testOnly?: unknown;
}

const PROVIDER_URLS: Record<Provider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

function isProvider(value: unknown): value is Provider {
  return value === 'openai' || value === 'qwen' || value === 'openrouter';
}

function cleanMessages(value: unknown): IncomingMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) return null;
  const messages = value.filter((item): item is IncomingMessage => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as { role?: unknown; content?: unknown };
    return (candidate.role === 'user' || candidate.role === 'assistant')
      && typeof candidate.content === 'string'
      && candidate.content.trim().length > 0
      && candidate.content.length <= 12_000;
  });
  return messages.length === value.length ? messages : null;
}

function response(status: number, body: Record<string, unknown>): { status: number; body: Record<string, unknown> } {
  return { status, body };
}

/** Shared provider adapter used by the Vercel function and the local Vite server. */
export async function handleAIChat(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const input = (body && typeof body === 'object' ? body : {}) as ChatRequestBody;
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const provider = isProvider(input.provider) ? input.provider : 'openai';
  const model = typeof input.model === 'string' && input.model.trim().length > 0
    ? input.model.trim().slice(0, 120)
    : provider === 'qwen' ? 'qwen-plus' : provider === 'openrouter' ? 'openai/gpt-4o-mini' : 'gpt-4o-mini';
  const testOnly = input.testOnly === true;
  const conversationMessages = testOnly ? [{ role: 'user' as const, content: 'Reply with exactly OK.' }] : cleanMessages(input.messages);

  if (apiKey.length < 8) return response(400, { error: 'Please paste a valid API key in Settings first.' });
  if (!conversationMessages) return response(400, { error: 'Please enter a message before sending.' });

  const messages = [
    { role: 'system' as const, content: SMRITI_SYSTEM_PROMPT },
    ...conversationMessages,
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const upstream = await fetch(PROVIDER_URLS[provider], {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: testOnly ? 4 : 900,
        ...(provider === 'openrouter' ? { reasoning: { effort: 'none' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) return response(401, { error: 'The API key was rejected. Check it in Settings.' });
      if (upstream.status === 404) return response(400, { error: 'That model was not found. Check the model name in Settings.' });
      return response(502, { error: 'The AI service could not answer right now. Please try again.' });
    }

    const payload = await upstream.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return response(502, { error: 'The AI service returned an empty response.' });
    return response(200, testOnly ? { ok: true } : { content: content.trim() });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return response(504, { error: 'The AI service took too long to respond. Please try again.' });
    return response(502, { error: 'The AI service is unavailable. Check your connection and try again.' });
  } finally {
    clearTimeout(timeout);
  }
}
