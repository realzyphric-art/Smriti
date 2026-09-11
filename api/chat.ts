import { handleAIChat } from '../server/aiChatHandler';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  try {
    const result = await handleAIChat(await request.json());
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'The AI request could not be completed.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
