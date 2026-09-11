interface Bar {
  label: string;
  value: number; // 0..max
  display?: string; // optional value shown above the bar
  variant?: 'default' | 'muted' | 'amber';
}

interface ProgressChartProps {
  bars: Bar[];
  max?: number;
  ariaLabel: string;
}

export function ProgressChart({ bars, max, ariaLabel }: ProgressChartProps) {
  const peak = Math.max(max ?? 0, ...bars.map((b) => b.value), 1);

  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      {bars.map((b, i) => {
        const pct = Math.max(4, Math.round((b.value / peak) * 100));
        const cls =
          b.value === 0
            ? 'chart__bar chart__bar--empty'
            : b.variant === 'amber'
              ? 'chart__bar chart__bar--amber'
              : b.variant === 'muted'
                ? 'chart__bar chart__bar--muted'
                : 'chart__bar';
        return (
          <div className="chart__col" key={i}>
            {b.display && <span className="chart__value">{b.display}</span>}
            <div className={cls} style={{ height: `${pct}%` }} />
            <span className="chart__label">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
