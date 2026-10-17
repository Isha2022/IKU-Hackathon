type ConfidenceBarProps = {
  confidence: number;
  label?: string;
  className?: string;
};

function ConfidenceBar({
  confidence,
  label,
  className = "",
}: ConfidenceBarProps) {
  const percentage = Math.round(Math.max(0, Math.min(1, confidence)) * 100);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        aria-label={label ?? "Confidence"}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percentage}
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
        role="meter"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {label ? `${label} · ` : ""}
        {percentage}%
      </span>
    </div>
  );
}

export { ConfidenceBar };
