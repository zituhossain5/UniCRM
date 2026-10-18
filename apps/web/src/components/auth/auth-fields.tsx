'use client';

import { Button, Input, type InputProps } from '@unicrm/ui';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, CircleAlert, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

interface AuthFieldProps extends Omit<InputProps, 'id'> {
  id: string;
  label: string;
  icon: LucideIcon;
  labelAction?: ReactNode;
}

function describeValidity(input: HTMLInputElement, label: string): string {
  const { validity } = input;
  if (validity.valueMissing) return `${label} is required.`;
  if (validity.typeMismatch && input.type === 'email') return 'Enter a valid email address.';
  if (validity.tooShort) return `Use at least ${input.minLength} characters.`;
  return input.validationMessage;
}

/**
 * Renders native constraint-validation failures inline instead of as browser bubbles.
 * The constraints themselves (required, type, minLength) are unchanged.
 */
function useInlineValidity(label: string, props: Pick<InputProps, 'onInvalid' | 'onInput'>) {
  const [message, setMessage] = useState('');

  function onInvalid(event: FormEvent<HTMLInputElement>) {
    props.onInvalid?.(event);
    const input = event.currentTarget;
    event.preventDefault();
    setMessage(describeValidity(input, label));
    if (input.form?.querySelector(':invalid') === input) input.focus();
  }

  function onInput(event: Parameters<NonNullable<InputProps['onInput']>>[0]) {
    props.onInput?.(event);
    if (!message) return;
    const input = event.currentTarget;
    setMessage(input.validity.valid ? '' : describeValidity(input, label));
  }

  return { message, onInvalid, onInput };
}

export function AuthTextField({
  id,
  label,
  icon: Icon,
  labelAction,
  trailing,
  invalid,
  className,
  'aria-describedby': describedBy,
  onInvalid,
  onInput,
  ...props
}: AuthFieldProps & { trailing?: ReactNode }) {
  const validity = useInlineValidity(label, { onInvalid, onInput });
  const errorId = `${id}-error`;
  const descriptions = [describedBy, validity.message ? errorId : undefined]
    .filter(Boolean)
    .join(' ');
  const isInvalid = Boolean(invalid || validity.message);

  return (
    <div className="auth-field" data-invalid={isInvalid || undefined}>
      <div className="auth-field-label-row">
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <div className={`auth-input-wrap${trailing ? ' auth-input-wrap--trailing' : ''}`}>
        <Icon aria-hidden="true" className="auth-input-icon" size={18} strokeWidth={1.8} />
        <Input
          aria-describedby={descriptions || undefined}
          className={`auth-input${className ? ` ${className}` : ''}`}
          id={id}
          invalid={isInvalid}
          onInput={validity.onInput}
          onInvalid={validity.onInvalid}
          {...props}
        />
        {trailing}
      </div>
      {validity.message ? (
        <p className="auth-field-error" id={errorId}>
          <CircleAlert aria-hidden="true" size={14} strokeWidth={2} />
          {validity.message}
        </p>
      ) : null}
    </div>
  );
}

export function AuthPasswordField(props: Omit<AuthFieldProps, 'icon' | 'type'>) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? 'Hide password' : 'Show password';

  return (
    <AuthTextField
      {...props}
      icon={LockKeyhole}
      trailing={
        <button
          aria-controls={props.id}
          aria-label={toggleLabel}
          aria-pressed={visible}
          className="auth-password-toggle"
          onClick={() => setVisible((current) => !current)}
          title={toggleLabel}
          type="button"
        >
          {visible ? (
            <EyeOff aria-hidden="true" size={18} strokeWidth={1.8} />
          ) : (
            <Eye aria-hidden="true" size={18} strokeWidth={1.8} />
          )}
        </button>
      }
      type={visible ? 'text' : 'password'}
    />
  );
}

export function AuthSubmitButton({
  children,
  loading,
  loadingLabel,
}: {
  children: ReactNode;
  loading: boolean;
  loadingLabel: string;
}) {
  return (
    <Button className="auth-submit" loading={loading} type="submit">
      <span>{loading ? loadingLabel : children}</span>
      {loading ? null : (
        <ArrowRight aria-hidden="true" className="auth-submit-arrow" size={17} strokeWidth={2} />
      )}
    </Button>
  );
}
