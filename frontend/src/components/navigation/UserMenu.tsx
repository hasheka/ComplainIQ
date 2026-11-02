import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Settings } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!user) return null;
  const initials = user.display_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white transition-colors hover:bg-navy-700">
        {initials}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-30 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-raised animate-fade-in">
          <div className="border-b border-slate-100 px-3 pb-2 pt-1">
            <p className="truncate text-sm font-semibold text-navy-900">{user.display_name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link role="menuitem" to="/app/settings" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-navy-800 hover:bg-slate-50"><Settings className="h-4 w-4" aria-hidden />Settings</Link>
          <button role="menuitem" type="button" onClick={async () => { await logout(); navigate('/', { replace: true }); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-navy-800 hover:bg-slate-50"><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
        </div>
      )}
    </div>
  );
}
