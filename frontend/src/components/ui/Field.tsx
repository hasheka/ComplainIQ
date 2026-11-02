import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const controlBase =
  'w-full rounded-lg border border-slate-200 bg-white text-sm text-navy-900 shadow-sm transition-colors duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50 disabled:text-slate-400';

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}

export function FieldWrapper({ label, htmlFor, hint, error, children, className = '' }: FieldWrapperProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : (
        hint && <p className="text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  id: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string | null;
  wrapperClassName?: string;
}

export function SelectField({ label, id, options, placeholder, error, wrapperClassName, ...rest }: SelectFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={id} error={error} className={wrapperClassName}>
      <select id={id} className={`${controlBase} h-10 px-3 pr-8`} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  error?: string | null;
  wrapperClassName?: string;
}

export function TextField({ label, id, error, wrapperClassName, ...rest }: TextFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={id} error={error} className={wrapperClassName}>
      <input id={id} className={`${controlBase} h-10 px-3`} {...rest} />
    </FieldWrapper>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlBase} h-10 px-3 ${props.className ?? ''}`} {...props} />;
}

export function TextAreaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${controlBase} px-3 py-2.5 ${props.className ?? ''}`} {...props} />;
}
