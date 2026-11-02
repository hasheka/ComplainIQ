interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`h-7 rounded-md px-3 text-xs font-medium transition-all duration-200 ${
              active
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-slate-500 hover:text-navy-800'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
