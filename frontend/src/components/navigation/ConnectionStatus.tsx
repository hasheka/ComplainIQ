import { useState } from 'react';
import { ChevronDown, ChevronUp, CircleSlash, Wifi, WifiOff } from 'lucide-react';
import type { ConnectionState } from '@/hooks/useBackendHealth';

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const [expanded, setExpanded] = useState(false);

  const presentation = {
    checking: { dot: 'bg-amber-400 animate-pulse', label: 'Checking server', tone: 'text-slate-600 bg-slate-50 border-slate-200' },
    connected: { dot: 'bg-emerald-500', label: 'Server connected', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    offline: { dot: 'bg-rose-500', label: 'Server offline', tone: 'text-rose-700 bg-rose-50 border-rose-200' },
  }[state.status];

  const detail = state.status === 'connected' || state.status === 'offline' ? state.detail : 'Contacting the server...';

  const Icon = state.status === 'connected' ? Wifi : state.status === 'offline' ? WifiOff : CircleSlash;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors duration-200 hover:shadow-sm ${presentation.tone}`}
        aria-expanded={expanded}
        aria-label={`${presentation.label}. Show details`}
      >
        <span className={`h-2 w-2 rounded-full ${presentation.dot}`} aria-hidden />
        <Icon className="hidden h-3.5 w-3.5 sm:block" aria-hidden />
        <span className="hidden md:inline">{presentation.label}</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="absolute right-0 top-11 w-72 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-raised animate-fade-in">
          <p className="text-sm font-semibold text-navy-900">{presentation.label}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{detail}</p>
        </div>
      )}
    </div>
  );
}
