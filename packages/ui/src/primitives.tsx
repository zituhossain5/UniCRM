'use client';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Radio as BaseRadio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { Check, ChevronDown, LoaderCircle } from 'lucide-react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  disabled,
  loading,
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={classes('ui-button', `ui-button--${variant}`, className)}
      disabled={disabled || loading}
      type="button"
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="ui-spin" size={15} /> : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'outline';
}

export function IconButton({
  children,
  className,
  label,
  size = 'md',
  variant = 'ghost',
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={classes(
        'ui-icon-button',
        `ui-icon-button--${size}`,
        `ui-icon-button--${variant}`,
        className,
      )}
      title={label}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={classes('ui-input', className)}
      {...props}
    />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={classes('ui-input ui-textarea', className)}
      {...props}
    />
  );
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  defaultValue?: string;
  disabled?: boolean;
  label?: string;
  name?: string;
  onValueChange?: (value: string | null) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  value?: string | null;
}

export function Select({
  defaultValue,
  disabled,
  label,
  name,
  onValueChange,
  options,
  placeholder,
  value,
}: SelectProps) {
  return (
    <BaseSelect.Root
      defaultValue={defaultValue}
      disabled={disabled}
      items={options}
      name={name}
      onValueChange={(nextValue) => onValueChange?.(nextValue)}
      value={value}
    >
      {label ? <BaseSelect.Label className="ui-field-label">{label}</BaseSelect.Label> : null}
      <BaseSelect.Trigger className="ui-select-trigger">
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon>
          <ChevronDown aria-hidden="true" size={15} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="ui-popup-positioner" sideOffset={6}>
          <BaseSelect.Popup className="ui-select-popup">
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item className="ui-select-item" key={option.value} value={option.value}>
                  <BaseSelect.ItemIndicator>
                    <Check aria-hidden="true" size={14} />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

export interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  label: ReactNode;
  name?: string;
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
  checked,
  defaultChecked,
  disabled,
  label,
  name,
  onCheckedChange,
}: CheckboxProps) {
  return (
    <label className="ui-choice-label">
      <BaseCheckbox.Root
        checked={checked}
        className="ui-checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        name={name}
        onCheckedChange={onCheckedChange}
      >
        <BaseCheckbox.Indicator>
          <Check aria-hidden="true" size={13} strokeWidth={3} />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>{label}</span>
    </label>
  );
}

export interface RadioOption {
  label: string;
  value: string;
}
export interface RadioGroupProps {
  defaultValue?: string;
  disabled?: boolean;
  label?: string;
  name?: string;
  options: readonly RadioOption[];
}

export function RadioGroup({ defaultValue, disabled, label, name, options }: RadioGroupProps) {
  return (
    <fieldset className="ui-fieldset">
      {label ? <legend className="ui-field-label">{label}</legend> : null}
      <BaseRadioGroup
        className="ui-radio-group"
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
      >
        {options.map((option) => (
          <label className="ui-choice-label" key={option.value}>
            <BaseRadio.Root className="ui-radio" value={option.value}>
              <BaseRadio.Indicator className="ui-radio-indicator" />
            </BaseRadio.Root>
            <span>{option.label}</span>
          </label>
        ))}
      </BaseRadioGroup>
    </fieldset>
  );
}

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  label: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
}

export function Switch({ checked, defaultChecked, disabled, label, onCheckedChange }: SwitchProps) {
  return (
    <label className="ui-choice-label ui-switch-label">
      <span>{label}</span>
      <BaseSwitch.Root
        checked={checked}
        className="ui-switch"
        defaultChecked={defaultChecked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      >
        <BaseSwitch.Thumb className="ui-switch-thumb" />
      </BaseSwitch.Root>
    </label>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
}) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}

export function StatusBadge({
  status,
}: {
  status: 'New' | 'Qualified' | 'Proposal Sent' | 'Won' | 'Lost';
}) {
  const tones = {
    New: 'primary',
    Qualified: 'warning',
    'Proposal Sent': 'neutral',
    Won: 'success',
    Lost: 'danger',
  } as const;
  return (
    <Badge tone={tones[status]}>
      <span className="ui-badge-dot" />
      {status}
    </Badge>
  );
}

export function Avatar({
  fallback,
  label,
  size = 'md',
}: {
  fallback: string;
  label: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span aria-label={label} className={`ui-avatar ui-avatar--${size}`} role="img">
      {fallback}
    </span>
  );
}
