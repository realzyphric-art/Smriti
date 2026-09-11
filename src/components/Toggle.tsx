import { Icon } from './Icon';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  onText?: string;
  offText?: string;
  disabled?: boolean;
}

/** Large, accessible on/off switch. */
export function Toggle({ checked, onChange, label, onText, offText, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${checked ? onText ?? 'On' : offText ?? 'Off'}`}
      className="switch"
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb">
          {checked ? <Icon name="check" size={16} strokeWidth={3} /> : null}
        </span>
      </span>
      <span className="switch__label" aria-hidden="true">
        {checked ? onText ?? 'On' : offText ?? 'Off'}
      </span>
    </button>
  );
}
