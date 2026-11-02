import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { BrandMark } from '@/components/navigation/BrandMark';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { PasswordField } from '@/components/ui/PasswordField';
import { useAuth } from '@/context/AuthContext';
import { errorMessage } from '@/utils/format';

export const MIN_PASSWORD = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-navy-950 p-10 text-navy-100 lg:flex">
        <BrandMark />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight text-white">See what your customers keep complaining about.</h2>
          <p className="mt-4 text-sm leading-relaxed text-navy-200">
            Upload complaint data, clean it, and explore recurring issues, sentiment and suggested areas to investigate, all on your own private workspace.
          </p>
          <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-navy-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" aria-hidden />
            Your files are visible only to your account, and you can delete them at any time.
          </p>
        </div>
        <p className="text-xs text-navy-300/70">Recommendations are suggestions to investigate, not confirmed causes.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Link to="/" aria-label="Home"><span className="inline-block rounded-xl bg-navy-950 p-3"><BrandMark /></span></Link></div>
          <h1 className="text-2xl font-semibold text-navy-950">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-center text-sm text-slate-500">{footer}</p>
        </div>
      </main>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid e-mail address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your workspace." footer={<>New here? <Link to="/register" className="font-medium text-teal-700 hover:underline">Create an account</Link></>}>
      <form onSubmit={submit} noValidate className="space-y-5">
        <FormError message={formError} />
        <TextField label="E-mail" id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} aria-invalid={Boolean(errors.email)} />
        <PasswordField label="Password" id="login-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <Button type="submit" loading={busy} className="w-full">{busy ? 'Signing in...' : 'Sign in'}</Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Enter your name.';
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid e-mail address.';
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (confirm !== password) next.confirm = 'The passwords do not match.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate('/app/data', { replace: true });
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="It takes a minute. Then upload your first file." footer={<>Already have an account? <Link to="/login" className="font-medium text-teal-700 hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} noValidate className="space-y-5">
        <FormError message={formError} />
        <TextField label="Your name" id="reg-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} />
        <TextField label="E-mail" id="reg-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <PasswordField label="Password" id="reg-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint={`At least ${MIN_PASSWORD} characters. A few random words work well.`} />
        <PasswordField label="Confirm password" id="reg-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <Button type="submit" loading={busy} className="w-full">{busy ? 'Creating account...' : 'Create account'}</Button>
      </form>
    </AuthShell>
  );
}
