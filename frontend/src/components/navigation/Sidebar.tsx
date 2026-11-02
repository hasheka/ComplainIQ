import { NavLink } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { BrandMark } from '@/components/navigation/BrandMark';
import { NAV_ITEMS } from '@/components/navigation/navItems';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onToggleCollapsed, onCloseMobile }: SidebarProps) {
  const showLabels = !collapsed;

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-navy-950/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onCloseMobile}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-navy-950 text-navy-100 transition-all duration-300 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-[260px] lg:w-[80px]' : 'w-[260px]'}`}
        aria-label="Main navigation"
      >
        <div className={`flex h-16 items-center border-b border-white/5 px-5 ${collapsed ? 'lg:justify-center lg:px-0' : 'justify-between'}`}>
          <div className={collapsed ? 'lg:hidden' : ''}>
            <BrandMark />
          </div>
          <div className={collapsed ? 'hidden lg:block' : 'hidden'}>
            <BrandMark compact />
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1.5 text-navy-200 hover:bg-white/10 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {showLabels && (
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-300/70">Workspace</p>
          )}
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/app'}
                onClick={onCloseMobile}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    collapsed ? 'lg:justify-center lg:px-0' : ''
                  } ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-navy-200 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-teal-400" aria-hidden />
                    )}
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? 'text-teal-300' : 'text-navy-300 group-hover:text-teal-300'}`}
                      aria-hidden
                    />
                    <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="hidden border-t border-white/5 p-3 lg:block">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-navy-200 transition-colors hover:bg-white/5 hover:text-white ${
              collapsed ? 'justify-center px-0' : ''
            }`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronsRight className="h-[18px] w-[18px]" /> : <ChevronsLeft className="h-[18px] w-[18px]" />}
            {!collapsed && <span>Collapse menu</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
