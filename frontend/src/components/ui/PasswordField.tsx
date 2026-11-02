import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { FieldWrapper, TextInput } from '@/components/ui/Field';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  id: string;
  error?: string | null;
  hint?: string;
}

export function PasswordField({ label, id, error, hint, ...rest }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldWrapper label={label} htmlFor={id} error={error} hint={hint}>
      <div className="relative">
        <TextInput id={id} type={visible ? 'text' : 'password'} style={{ paddingRight: '2.75rem' }} aria-invalid={Boolean(error)} {...rest} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-colors hover:text-navy-700"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </FieldWrapper>
  );
}
