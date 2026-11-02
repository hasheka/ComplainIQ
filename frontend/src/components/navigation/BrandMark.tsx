import { Activity } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '@/config/brand';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-md shadow-teal-900/30">
        <Activity className="h-5 w-5 text-white" strokeWidth={2.5} aria-hidden />
      </span>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-[0.08em] text-white">{APP_NAME.toUpperCase()}</p>
          <p className="truncate text-[11px] text-navy-200/80">{APP_TAGLINE}</p>
        </div>
      )}
    </div>
  );
}
