import type { SentimentLabel } from '@/types/types';
import { Badge } from '@/components/ui/Badge';
import { capitalise } from '@/utils/format';

export const SENTIMENT_COLORS: Record<SentimentLabel, string> = {
  positive: '#10b981',
  neutral: '#94a3b8',
  negative: '#e11d48',
};

export const SENTIMENT_ORDER: SentimentLabel[] = ['positive', 'neutral', 'negative'];

export function SentimentBadge({ sentiment }: { sentiment: SentimentLabel | null | undefined }) {
  if (!sentiment) return <span className="text-slate-400">—</span>;
  const tone = sentiment === 'positive' ? 'success' : sentiment === 'negative' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{capitalise(sentiment)}</Badge>;
}
