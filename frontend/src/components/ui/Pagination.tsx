import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '@/utils/format';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const button =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-teal-400 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-navy-800">{formatNumber(from)}</span> to{' '}
        <span className="font-medium text-navy-800">{formatNumber(to)}</span> of{' '}
        <span className="font-medium text-navy-800">{formatNumber(total)}</span> records
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={button} onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[90px] text-center text-xs text-slate-600">
          Page {formatNumber(page)} of {formatNumber(totalPages)}
        </span>
        <button
          type="button"
          className={button}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
