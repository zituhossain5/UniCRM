'use client';

import { Input, type InputProps } from '@unicrm/ui';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

interface AuthPasswordFieldProps extends Omit<InputProps, 'type'> {
  label: string;
}

export function AuthPasswordField({ id, label, ...props }: AuthPasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? props.name;
  const toggleLabel = visible ? 'Hide password' : 'Show password';

  return (
    <div className="auth-field">
      <label htmlFor={inputId}>{label}</label>
      <span className="auth-password-field">
        <Input id={inputId} type={visible ? 'text' : 'password'} {...props} />
        <button
          aria-label={toggleLabel}
          aria-pressed={visible}
          className="auth-password-toggle"
          onClick={() => setVisible((current) => !current)}
          title={toggleLabel}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
        </button>
      </span>
    </div>
  );
}
