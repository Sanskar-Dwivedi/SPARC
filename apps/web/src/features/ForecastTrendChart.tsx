import type { ForecastPoint } from '../contract/types';

const WIDTH = 760;
const HEIGHT = 280;
const PADDING = { top: 24, right: 20, bottom: 54, left: 48 };

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function riskLabel(value: ForecastPoint['riskClass']): string {
  return value.replace('-', ' ');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function pathFor(values: number[], xFor: (index: number) => number, yFor: (value: number) => number): string {
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'}${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`).join(' ');
}

export function ForecastTrendChart({
  points,
  accent,
  hazardLabel,
  selectedIndex,
  onSelectPoint,
}: {
  points: ForecastPoint[];
  accent: string;
  hazardLabel: string;
  selectedIndex: number;
  onSelectPoint: (index: number) => void;
}) {
  const titleId = `forecast-trend-title-${hazardLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const xFor = (index: number) => PADDING.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yFor = (value: number) => PADDING.top + (1 - clamp(value)) * plotHeight;
  const probabilityPath = pathFor(points.map((point) => point.probability), xFor, yFor);
  const upper = points.map((point) => point.uncertainty.upper);
  const lower = points.map((point) => point.uncertainty.lower);
  const bandPath = points.length
    ? `${pathFor(upper, xFor, yFor)} ${lower
      .map((value, reverseIndex) => {
        const index = lower.length - 1 - reverseIndex;
        return `L${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`;
      })
      .join(' ')} Z`
    : '';
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  if (!points.length) {
    return (
      <div className="forecast-chart__empty">
        No forecast points were published for this hazard.
      </div>
    );
  }

  return (
    <div className="forecast-chart">
      <svg
        className="forecast-chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{hazardLabel} forecast probability by lead time</title>
        <desc>
          The line shows forecast probability. The shaded band shows the lower and upper uncertainty bounds.
        </desc>

        {[0, 0.25, 0.5, 0.75, 1].map((value) => (
          <g key={value} className="forecast-chart__gridline">
            <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={yFor(value)} y2={yFor(value)} />
            <text x={PADDING.left - 10} y={yFor(value) + 4} textAnchor="end">{formatPercent(value)}</text>
          </g>
        ))}

        <path className="forecast-chart__band" d={bandPath} style={{ fill: accent }} />
        <path className="forecast-chart__line" d={probabilityPath} style={{ stroke: accent }} />

        {points.map((point, index) => (
          <circle
            key={`${point.validAt}-${point.leadTime}`}
            className={`forecast-chart__dot${index === selectedIndex ? ' is-selected' : ''}`}
            cx={xFor(index)}
            cy={yFor(point.probability)}
            r={index === selectedIndex ? 5 : 3.5}
            style={{ fill: accent, stroke: index === selectedIndex ? accent : 'var(--panel)' }}
          />
        ))}

        {points.map((point, index) => {
          if (index % labelStep !== 0 && index !== points.length - 1) return null;
          return (
            <text key={`${point.validAt}-label`} className="forecast-chart__x-label" x={xFor(index)} y={HEIGHT - 18} textAnchor="middle">
              {formatDate(point.validAt)}
            </text>
          );
        })}
      </svg>

      <ol className="forecast-chart__point-list" aria-label={`${hazardLabel} forecast points`}>
        {points.map((point, index) => (
          <li key={`${point.validAt}-${point.leadTime}-button`}>
            <button
              type="button"
              className={`forecast-chart__point${index === selectedIndex ? ' is-selected' : ''}`}
              aria-pressed={index === selectedIndex}
              onClick={() => onSelectPoint(index)}
            >
              <span>{point.leadTime} {point.leadUnit}</span>
              <strong>{formatPercent(point.probability)}</strong>
              <small className={`risk-badge risk-badge--${point.riskClass}`}>{riskLabel(point.riskClass)}</small>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
