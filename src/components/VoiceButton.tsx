import { useEffect } from 'react';
import { useVoice } from '@/hooks/useVoice';
import { useToast } from '@/hooks/useToast';
import { useI18n } from '@/i18n';
import { Icon } from './Icon';

interface VoiceButtonProps {
  /** Text to speak (already localized). */
  text: string;
  /** Visible label; defaults to "Read Aloud". */
  label?: string;
  compact?: boolean;
  className?: string;
}

/** A pill "Read Aloud" control used across patient screens. */
export function VoiceButton({ text, label, compact, className = '' }: VoiceButtonProps) {
  const { say, supported, enabled, error } = useVoice();
  const { showToast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    if (error) showToast(error, '🔈');
  }, [error, showToast]);

  const handle = () => {
    if (!supported) {
      showToast(t('voice.notAvailable'), '🔈');
      return;
    }
    if (!enabled) {
      showToast(t('settings.voiceGuidance') + ': ' + t('settings.off'), '🔈');
      return;
    }
    say(text);
  };

  return (
    <button
      type="button"
      onClick={handle}
      className={`btn btn--audio ${compact ? '' : ''} ${className}`}
      aria-label={label ?? t('common.readAloud')}
      style={compact ? { minHeight: '2.75rem', padding: '0 1rem' } : undefined}
    >
      <Icon name="volume" size={compact ? 20 : 24} />
      <span>{label ?? t('common.readAloud')}</span>
    </button>
  );
}
