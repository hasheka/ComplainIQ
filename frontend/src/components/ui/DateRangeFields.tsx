import { TextField } from '@/components/ui/Field';

interface DateRangeFieldsProps {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  idPrefix: string;
}

export function DateRangeFields({ start, end, onStartChange, onEndChange, idPrefix }: DateRangeFieldsProps) {
  const invalid = Boolean(start && end && end < start);
  return (
    <>
      <TextField
        id={`${idPrefix}-start`}
        label="From"
        type="date"
        value={start}
        max={end || undefined}
        onChange={(event) => onStartChange(event.target.value)}
        wrapperClassName="w-full sm:w-40"
      />
      <TextField
        id={`${idPrefix}-end`}
        label="To"
        type="date"
        value={end}
        min={start || undefined}
        onChange={(event) => onEndChange(event.target.value)}
        error={invalid ? 'End date must be after the start date.' : null}
        wrapperClassName="w-full sm:w-40"
      />
    </>
  );
}
