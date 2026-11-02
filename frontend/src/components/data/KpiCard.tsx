import type { ReactNode } from 'react';
import { TrendingUp, type LucideIcon } from 'lucide-react';

type Accent = 'navy' | 'teal' | 'sky' | 'amber' | 'emerald' | 'rose';

const accentClasses: Record<Accent, string> = {
  navy: 'bg-navy-50 text-navy-700',
  teal: 'bg-teal-50 text-teal-700',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  rose: 'bg-rose-50 text-rose-700',
};

interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  accent?: Accent;
  hint?: string;
}

export function KpiCard({ label, value, icon: Icon, accent = 'teal', hint }: KpiCardProps) {
  return (
    <div className="group flex flex-col gap-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-raised">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 ${accentClasses[accent]}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div>
        <p className="truncate text-2xl font-semibold text-navy-950" title={typeof value === 'string' ? value : undefined}>
          {value}
        </p>
        {hint && (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
            <TrendingUp className="h-3 w-3 shrink-0 text-teal-600" aria-hidden />
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
