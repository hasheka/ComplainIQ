import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { AsyncSection } from '@/components/data/AsyncSection';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { PasswordField } from '@/components/ui/PasswordField';
import { MIN_PASSWORD } from '@/pages/AuthPages';
import { useAuth } from '@/context/AuthContext';
import { useApiResource } from '@/hooks/useApiResource';
import { changePassword, deleteAccount, fetchInfo } from '@/services/api';
import { errorMessage, formatDate } from '@/utils/format';

function Bullets({ items }: { items: string[] }) {
  return <ul className="space-y-1.5 text-sm text-slate-600">{items.map((t) => <li key={t} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal-500" aria-hidden />{t}</li>)}</ul>;
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const info = useApiResource((signal) => fetchInfo(signal), []);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmPw, setConfirmPw] = useState('');
  const [delError, setDelError] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setPwDone(false);
    if (!current) return setPwError('Enter your current password.');
    if (next.length < MIN_PASSWORD) return setPwError(`The new password needs at least ${MIN_PASSWORD} characters.`);
    if (next !== again) return setPwError('The new passwords do not match.');
    setPwBusy(true);
    setPwError(null);
    try {
      await changePassword({ current_password: current, new_password: next });
      setCurrent(''); setNext(''); setAgain('');
      setPwDone(true);
    } catch (caught) {
      setPwError(errorMessage(caught));
    } finally {
      setPwBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!confirmPw) return setDelError('Enter your password to confirm.');
    setDelBusy(true);
    setDelError(null);
    try {
      await deleteAccount(confirmPw);
      await logout();
      navigate('/', { replace: true });
    } catch (caught) {
      setDelError(errorMessage(caught));
      setDelBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="Settings" description="Your account details, how your data is handled, and options to leave." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Account">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Name</dt><dd className="font-medium text-navy-900">{user?.display_name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">E-mail</dt><dd className="font-medium text-navy-900">{user?.email}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Member since</dt><dd className="font-medium text-navy-900">{formatDate(user?.created_at)}</dd></div>
          </dl>
          <Button variant="secondary" className="mt-5" icon={<LogOut className="h-4 w-4" />} onClick={async () => { await logout(); navigate('/', { replace: true }); }}>Sign out</Button>
        </Card>

        <Card title="Change password" subtitle="Changing it signs you out on your other devices.">
          <form onSubmit={submitPassword} noValidate className="space-y-4">
            <PasswordField label="Current password" id="pw-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <PasswordField label="New password" id="pw-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint={`At least ${MIN_PASSWORD} characters.`} />
            <PasswordField label="Repeat new password" id="pw-again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
            {pwError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{pwError}</p>}
            {pwDone && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">Your password was changed.</p>}
            <Button type="submit" loading={pwBusy}>Change password</Button>
          </form>
        </Card>
      </div>

      <Card title="Your data and privacy" subtitle="How uploaded files are stored and processed.">
        <AsyncSection loading={info.loading} error={info.error} onRetry={info.refetch} isEmpty={!info.data}>
          {info.data && (
            <div className="grid gap-6 lg:grid-cols-3">
              <div><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy-900"><ShieldCheck className="h-4 w-4 text-teal-600" aria-hidden />Storage</h3><Bullets items={info.data.privacy.storage} /></div>
              <div><h3 className="mb-2 text-sm font-semibold text-navy-900">Processing</h3><Bullets items={[...info.data.privacy.processing, info.data.sentiment_note]} /></div>
              <div><h3 className="mb-2 text-sm font-semibold text-navy-900">Retention and limits</h3><Bullets items={[...info.data.privacy.retention, `Files up to ${info.data.limits.max_upload_mb} MB and ${info.data.limits.max_rows.toLocaleString()} rows; up to ${info.data.limits.max_datasets_per_user} datasets; sessions last ${info.data.limits.session_days} days.`]} /></div>
            </div>
          )}
        </AsyncSection>
      </Card>

      <Card title="Delete account" subtitle="This cannot be undone.">
        <p className="text-sm text-slate-600">Deleting your account permanently removes your profile, every dataset and its files, and all saved reports.</p>
        <Button variant="danger" className="mt-4" icon={<Trash2 className="h-4 w-4" />} onClick={() => { setOpen(true); setDelError(null); setConfirmPw(''); }}>Delete my account</Button>
      </Card>

      <Modal open={open} title="Delete your account?" onClose={() => setOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={delBusy} onClick={() => void submitDelete()}>Delete everything</Button></>}>
        <p className="mb-4 text-sm text-slate-600">Enter your password to confirm. All your data will be deleted immediately.</p>
        <PasswordField label="Password" id="confirm-delete" autoComplete="current-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} error={delError} />
      </Modal>
    </div>
  );
}
