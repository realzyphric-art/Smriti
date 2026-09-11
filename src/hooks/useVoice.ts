import { useCallback, useState } from 'react';
import { useSettings } from './useSettings';
import { isVoiceSupported, speak, stopSpeaking } from '@/services/voiceService';

interface UseVoice {
  supported: boolean;
  enabled: boolean;
  /** Speak text in the active language. Returns false if it couldn't. */
  say: (text: string) => boolean;
  stop: () => void;
  error: string | null;
}

export function useVoice(): UseVoice {
  const { settings } = useSettings();
  const supported = isVoiceSupported();
  const enabled = settings.voiceEnabled;
  const [error, setError] = useState<string | null>(null);

  const say = useCallback(
    (text: string) => {
      setError(null);
      return speak(text, settings.language, setError);
    },
    [settings.language],
  );

  return { supported, enabled, say, stop: stopSpeaking, error };
}
