import { useEffect, useState } from 'react';
import type { AIProvider } from '@/types';
import { storageService } from '@/services/storageService';
import { requestAIChat } from '@/services/chatService';
import { useToast } from '@/hooks/useToast';
import { Card } from './Card';
import { Button } from './Button';
import { Icon } from './Icon';

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  qwen: 'qwen-plus',
  openrouter: 'openai/gpt-4o-mini',
};

export function AISettingsCard() {
  const { showToast } = useToast();
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [model, setModel] = useState(DEFAULT_MODELS.openai);
  const [draftKey, setDraftKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'tested' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void storageService.getAISettings().then((settings) => {
      if (!live || !settings) return;
      setProvider(settings.provider);
      setModel(settings.model);
      setSavedKey(settings.apiKey);
    });
    return () => { live = false; };
  }, []);

  const activeKey = draftKey.trim() || savedKey;
  const configured = Boolean(savedKey);

  const saveKey = async () => {
    const key = draftKey.trim();
    if (!key) {
      showToast('Paste an API key before saving.', '🔑');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await storageService.putAISettings({ id: 'default', provider, model: model.trim() || DEFAULT_MODELS[provider], apiKey: key, updatedAt: Date.now() });
      setSavedKey(key);
      setDraftKey('');
      setStatus('saved');
      showToast('API key saved on this device.', '✓');
    } catch {
      setStatus('error');
      setError('The key could not be saved on this device.');
    } finally {
      setBusy(false);
    }
  };

  const testKey = async () => {
    if (!activeKey) {
      showToast('Paste an API key before testing.', '🔑');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestAIChat({ apiKey: activeKey, provider, model: model.trim() || DEFAULT_MODELS[provider], messages: [], testOnly: true });
      setStatus('tested');
      showToast('API key works.', '✓');
    } catch (reason) {
      setStatus('error');
      setError(reason instanceof Error ? reason.message : 'The API key could not be tested.');
    } finally {
      setBusy(false);
    }
  };

  const updateProvider = (next: AIProvider) => {
    setProvider(next);
    if (!model.trim() || model === DEFAULT_MODELS[provider]) setModel(DEFAULT_MODELS[next]);
    setStatus('idle');
  };

  return (
    <Card variant="tint" padLg className={`ai-settings-card ai-settings-state-${status}`}>
      <div className="row" style={{ gap: '0.75rem', marginBottom: '0.5rem' }}>
        <span className="mobile-row__icon" aria-hidden="true"><Icon name="sparkle" size={24} /></span>
        <div>
          <h2 className="card-title">AI Configuration</h2>
          <p className="muted">Connect the optional Smriti assistant.</p>
        </div>
      </div>

      <div className="ai-key-instructions">
        Paste your API key below. Your key is used to connect this chatbot to the AI service.
      </div>

      <p className="muted ai-settings-note">Smriti’s calm, gentle speaking style is always active in Chat. It uses short, clear language and one question at a time.</p>

      <div className="field">
        <label className="field__label" htmlFor="ai-api-key">API Key</label>
        <div className="ai-key-input">
          <input
            id="ai-api-key"
            className="input"
            type={showKey ? 'text' : 'password'}
            value={draftKey}
            onChange={(event) => { setDraftKey(event.target.value); setStatus('idle'); setError(''); }}
            placeholder={configured ? 'Saved key — paste a new key to replace it' : 'Paste your API key'}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="ai-key-toggle" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? 'Hide API key' : 'Show API key'}>
            <Icon name={showKey ? 'eye-off' : 'eye'} size={21} />
          </button>
        </div>
      </div>

      <div className="ai-settings-grid">
        <div className="field">
          <label className="field__label" htmlFor="ai-provider">Provider</label>
          <select id="ai-provider" className="select" value={provider} onChange={(event) => updateProvider(event.target.value as AIProvider)}>
            <option value="openai">OpenAI</option>
            <option value="qwen">Qwen / DashScope</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ai-model">Model</label>
          <input id="ai-model" className="input" value={model} onChange={(event) => { setModel(event.target.value); setStatus('idle'); }} placeholder={DEFAULT_MODELS[provider]} />
        </div>
      </div>

      <div className={`ai-key-status ${configured ? 'is-configured' : ''}`} role="status">
        <span className="ai-key-status__dot" />
        {configured ? 'API key configured on this device' : 'No API key configured'}
      </div>

      <div className="row ai-settings-actions">
        <Button variant="primary" onClick={() => void saveKey()} disabled={busy || !draftKey.trim()}>{busy ? 'Working…' : configured ? 'Replace API Key' : 'Save API Key'}</Button>
        <Button variant="secondary" onClick={() => void testKey()} disabled={busy || !activeKey}>Test API Key</Button>
      </div>
      {error && <p className="ai-settings-error" role="alert">{error}</p>}
      <p className="muted ai-settings-note">Your key is stored in this browser’s private app storage and is never added to chat history, URLs, or logs.</p>
    </Card>
  );
}
