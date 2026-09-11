import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { storageService } from '@/services/storageService';
import { requestAIChat } from '@/services/chatService';
import type { AISettings, ChatConversation, ChatMessage } from '@/types';

const welcomeMessage = 'Hello. I am here to listen and help with a calm conversation. What would you like to talk about today?';

function createConversation(): ChatConversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    messages: [{ id: crypto.randomUUID(), role: 'assistant', content: welcomeMessage, createdAt: now }],
  };
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function Chat() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [aiSettings, setAISettings] = useState<AISettings | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([storageService.getChatConversations(), storageService.getAISettings()]).then(([stored, settings]) => {
      if (!live) return;
      const next = stored.length ? stored.sort((a, b) => b.updatedAt - a.updatedAt) : [createConversation()];
      setConversations(next);
      setActiveId(next[0].id);
      setAISettings(settings);
      setReady(true);
      if (!stored.length) void storageService.putChatConversation(next[0]);
    });
    return () => { live = false; };
  }, []);

  const active = useMemo(() => conversations.find((conversation) => conversation.id === activeId) ?? conversations[0], [activeId, conversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages.length, busy]);

  const saveConversation = (conversation: ChatConversation) => {
    setConversations((items) => items.map((item) => item.id === conversation.id ? conversation : item).sort((a, b) => b.updatedAt - a.updatedAt));
    void storageService.putChatConversation(conversation);
  };

  const newChat = () => {
    const conversation = createConversation();
    setConversations((items) => [conversation, ...items]);
    setActiveId(conversation.id);
    setError('');
    void storageService.putChatConversation(conversation);
  };

  const deleteConversation = async (id: string) => {
    const remaining = conversations.filter((conversation) => conversation.id !== id);
    await storageService.deleteChatConversation(id);
    if (!remaining.length) {
      const conversation = createConversation();
      setConversations([conversation]);
      setActiveId(conversation.id);
      void storageService.putChatConversation(conversation);
    } else {
      setConversations(remaining);
      if (activeId === id) setActiveId(remaining[0].id);
    }
  };

  const clearConversation = () => {
    if (!active) return;
    const now = Date.now();
    saveConversation({ ...active, title: 'New conversation', updatedAt: now, messages: [{ id: crypto.randomUUID(), role: 'assistant', content: welcomeMessage, createdAt: now }] });
    setError('');
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || busy || !active) return;
    if (!aiSettings?.apiKey) {
      setError('Add your API key in Settings before starting a chat.');
      return;
    }
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content, createdAt: Date.now() };
    const nextMessages = [...active.messages, userMessage];
    const nextConversation = { ...active, title: active.messages.length <= 1 ? content.slice(0, 42) : active.title, updatedAt: Date.now(), messages: nextMessages };
    saveConversation(nextConversation);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const result = await requestAIChat({ apiKey: aiSettings.apiKey, provider: aiSettings.provider, model: aiSettings.model, messages: nextMessages });
      if (!result.content) throw new Error('The AI returned an empty response.');
      saveConversation({ ...nextConversation, updatedAt: Date.now(), messages: [...nextMessages, { id: crypto.randomUUID(), role: 'assistant', content: result.content, createdAt: Date.now() }] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The AI service could not answer.');
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  if (!ready) return <main className="page page--flow"><div className="card" role="status">Loading chat…</div></main>;

  return (
    <>
      <AppHeader subtitle="AI Assistant" />
      <main className="chat-shell">
        <aside className="chat-sidebar" aria-label="Conversations">
          <div className="chat-sidebar__top"><div><span className="eyebrow">Smriti</span><h1>Calm chat</h1></div><Button variant="primary" icon="plus" onClick={newChat}>New Chat</Button></div>
          <div className="chat-conversations">
            {conversations.map((conversation) => (
              <div key={conversation.id} className={`chat-conversation ${conversation.id === activeId ? 'is-active' : ''}`}>
                <button type="button" onClick={() => { setActiveId(conversation.id); setError(''); }}><strong>{conversation.title}</strong><span>{conversation.messages.length - 1} messages</span></button>
                <button type="button" className="chat-conversation__delete" onClick={() => void deleteConversation(conversation.id)} aria-label={`Delete ${conversation.title}`}><Icon name="trash" size={18} /></button>
              </div>
            ))}
          </div>
          {!aiSettings?.apiKey && <div className="chat-sidebar__notice"><strong>AI setup needed</strong><span>Add your key in Settings to begin.</span><button type="button" onClick={() => navigate('/settings')}>Open Settings</button></div>}
        </aside>

        <section className="chat-panel" aria-label="Chat conversation">
          <div className="chat-panel__header"><div><span className="eyebrow">Private on this device</span><h2>{active?.title ?? 'New conversation'}</h2></div><Button variant="ghost" icon="trash" onClick={clearConversation}>Clear</Button></div>
          <div className="chat-messages" aria-live="polite">
            {active?.messages.map((message) => (
              <article key={message.id} className={`chat-message chat-message--${message.role}`}>
                <div className="chat-message__avatar" aria-hidden="true">{message.role === 'assistant' ? '✦' : 'You'}</div>
                <div className="chat-message__body"><div className="chat-message__meta"><strong>{message.role === 'assistant' ? 'Smriti Assistant' : 'You'}</strong><time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt)}</time></div>{message.role === 'assistant' ? <MarkdownMessage content={message.content} /> : <p>{message.content}</p>}</div>
              </article>
            ))}
            {busy && <div className="chat-message chat-message--assistant"><div className="chat-message__avatar" aria-hidden="true">✦</div><div className="chat-message__body"><div className="chat-message__meta"><strong>Smriti Assistant</strong><span>Thinking…</span></div><div className="chat-typing" aria-label="Assistant is typing"><i /><i /><i /></div></div></div>}
            <div ref={endRef} />
          </div>
          {error && <div className="chat-error" role="alert"><span>{error}</span>{!aiSettings?.apiKey && <button type="button" onClick={() => navigate('/settings')}>Open Settings</button>}</div>}
          <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="Write a message…" rows={2} aria-label="Message" disabled={busy} />
            <button type="submit" className="chat-send" disabled={busy || !input.trim()} aria-label="Send message"><Icon name="arrow-right" size={22} /></button>
            <span className="chat-composer__hint">Enter to send · Shift+Enter for a new line</span>
          </form>
        </section>
      </main>
    </>
  );
}
