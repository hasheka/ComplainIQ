import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { DatasetStatus } from '@/types/api';

export function StatusBadge({ status }: { status: DatasetStatus }) {
  switch (status) {
    case 'ready': return <Badge tone="success">Ready</Badge>;
    case 'failed': return <Badge tone="danger">Failed</Badge>;
    case 'needs_mapping': return <Badge tone="warning">Needs columns</Badge>;
    default: return <Badge tone="warning"><Loader2 className="h-3 w-3 animate-spin" aria-hidden />{status === 'uploaded' ? 'Uploading' : 'Cleaning'}</Badge>;
  }
}
