import type { SortState } from '@/components/data/DataTable';

type Accessor<T> = (row: T) => string | number;

export function sortRows<T>(rows: T[], sort: SortState | null, accessors: Record<string, Accessor<T>>): T[] {
  const accessor = sort ? accessors[sort.key] : undefined;
  if (!sort || !accessor) return rows;
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = accessor(a);
    const right = accessor(b);
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    return String(left).localeCompare(String(right)) * direction;
  });
}

export function nextSort(current: SortState | null, key: string, defaultDirection: 'asc' | 'desc' = 'desc'): SortState {
  if (!current || current.key !== key) return { key, direction: defaultDirection };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}
