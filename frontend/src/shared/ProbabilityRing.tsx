const SIZE = 30;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
export const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** P2: the probability of close, as a ring filled to match. */
export function ProbabilityRing({ value, color }: { value: number; color: string }) {
  const filled = (CIRCUMFERENCE * Math.max(0, Math.min(100, value))) / 100;
  return (
    <span className="ring" role="img" aria-label={`${value}% probability`}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--line)"
          strokeWidth={STROKE}
        />
        <circle
          data-testid="ring-arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${filled.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className="ring-text">{value}%</span>
    </span>
  );
}
