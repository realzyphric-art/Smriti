import { useId, useState } from 'react';
import { Icon } from './Icon';

interface PasswordFieldProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  placeholder?: string;
}

/** Accessible password input with a large, mobile-friendly visibility toggle. */
export function PasswordField({
  id: providedId,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  placeholder,
}: PasswordFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          className="input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="password-field__toggle"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <Icon name={visible ? 'eye-off' : 'eye'} size={24} />
        </button>
      </div>
    </div>
  );
}
