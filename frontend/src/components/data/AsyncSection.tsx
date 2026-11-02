import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews';

interface AsyncSectionProps {
  loading: boolean;
  error: string | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
  loadingLabel?: string;
  children: ReactNode;
}

export function AsyncSection({
  loading,
  error,
  isEmpty = false,
  onRetry,
  emptyMessage,
  loadingLabel,
  children,
}: AsyncSectionProps) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading) return <LoadingState label={loadingLabel} />;
  if (isEmpty) return <EmptyState message={emptyMessage} />;
  return <>{children}</>;
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, action, className, children }: ChartCardProps) {
  return (
    <Card title={title} subtitle={subtitle} action={action} className={className} bodyClassName="pt-4">
      {children}
    </Card>
  );
}
