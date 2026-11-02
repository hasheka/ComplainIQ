import { Menu, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { ConnectionStatus } from '@/components/navigation/ConnectionStatus';
import { findNavItem } from '@/components/navigation/navItems';
import { DatasetSwitcher } from '@/components/navigation/DatasetSwitcher';
import { UserMenu } from '@/components/navigation/UserMenu';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/config/brand';
import { useBackendHealth } from '@/hooks/useBackendHealth';
import { useRefresh } from '@/hooks/useRefresh';

interface TopbarProps {
  onOpenMobileNav: () => void;
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const { pathname } = useLocation();
  const { refresh } = useRefresh();
  const connection = useBackendHealth();
  const current = findNavItem(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="rounded-lg p-2 text-navy-700 transition-colors hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700 sm:block">
              {APP_NAME}
            </p>
            <p className="truncate text-base font-semibold text-navy-950 sm:text-lg">{current.label}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <DatasetSwitcher />
          <ConnectionStatus state={connection} />
          <Button variant="secondary" size="sm" onClick={refresh} icon={<RefreshCw className="h-3.5 w-3.5" />} aria-label="Refresh data">
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
