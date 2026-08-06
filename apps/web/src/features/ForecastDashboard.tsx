import { useEffect, useState, type CSSProperties } from 'react';
import type {
  ForecastConfidence,
  ForecastDriver,
  ForecastHazard,
  ForecastPoint,
  ForecastRiskClass,
  ForecastRunResponse,
} from '../contract/types';
import { DataError } from '../data/errors';
import type { Repository } from '../data/repository';
import type { DataMode } from '../config';
import { Callout } from './Primitives';
import { EmptyView, LoadingView } from './StateViews';
import { ForecastMap } from './ForecastMap';
import { ForecastTrendChart } from './ForecastTrendChart';

const HAZARDS: readonly ForecastHazard[] = ['flood', 'drought', 'heat'];

const HAZARD_META: Record<ForecastHazard, {
  label: string;
  shortLabel: string;
  accent: string;
  description: string;
}> = {
  flood: {
    label: 'Flood risk',
    shortLabel: 'Flood',
    accent: '#4fb6c9',
    description: 'Rainfall, river level and soil saturation outlook',
  },
  drought: {
    label: 'Drought risk',
    shortLabel: 'Drought',
    accent: '#c99a5b',
    description: 'Water stress and dry-spell outlook',
  },
  heat: {
    label: 'Heat risk',
    shortLabel: 'Heat',
    accent: '#c97155',
    description: 'Temperature and heat-exposure outlook',
  },
};

type ForecastState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; value: ForecastRunResponse }
  | { status: 'error'; error: DataError };

type ForecastStateMap = Record<ForecastHazard, ForecastState>;

function makeStateMap(status: 'idle' | 'loading' = 'idle'): ForecastStateMap {
  return { flood: { status }, drought: { status }, heat: { status } };
}

function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  return new DataError('server', String((error as Error)?.message ?? error));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatRisk(value: ForecastRiskClass): string {
  return value.replace('-', ' ');
}

function formatConfidence(value: ForecastConfidence): string {
  return value === 'unknown' ? 'Unknown' : `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}

function formatDateTime(value: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDriverValue(driver: ForecastDriver): string {
  if (driver.value === null) return 'Unavailable';
  return `${formatNumber(driver.value)} ${driver.unit}`;
}

function directionLabel(direction: ForecastDriver['direction']): string {
  if (direction === 'increases-risk') return 'Increases risk';
  if (direction === 'decreases-risk') return 'Decreases risk';
  return 'Context';
}

function ForecastHazardCard({
  hazard,
  state,
  active,
  onSelect,
}: {
  hazard: ForecastHazard;
  state: ForecastState;
  active: boolean;
  onSelect: () => void;
}) {
  const meta = HAZARD_META[hazard];
  const style = { '--forecast-accent': meta.accent } as CSSProperties;
  const payload = state.status === 'ready' ? state.value : null;
  const run = payload?.data;

  return (
    <li>
      <button
        type="button"
        className={`forecast-card${active ? ' is-active' : ''}`}
        style={style}
        aria-pressed={active}
        onClick={onSelect}
      >
        <span className="forecast-card__topline">
          <span className="forecast-card__index">Forecast</span>
          <span className="forecast-card__status">
            {state.status === 'loading' || state.status === 'idle' ? 'Loading' : state.status === 'error' ? 'Unavailable' : payload?.meta.mock ? 'Synthetic API data' : 'API data'}
          </span>
        </span>
        <span className="forecast-card__title">{meta.label}</span>
        <span className="forecast-card__description">{meta.description}</span>

        {state.status === 'ready' && run ? (
          <>
            <span className="forecast-card__probability">{formatPercent(run.summary.peakProbability)}</span>
            <span className="forecast-card__probability-label">Peak probability</span>
            <span className={`risk-badge risk-badge--${run.summary.riskClass}`}>
              {formatRisk(run.summary.riskClass)} risk
            </span>
            <dl className="forecast-card__meta">
              <div><dt>Confidence</dt><dd>{formatConfidence(run.summary.confidence)}</dd></div>
              <div><dt>Peak</dt><dd>{formatDateTime(run.summary.peakValidAt, run.forecastWindow.timeZone)}</dd></div>
            </dl>
          </>
        ) : state.status === 'error' ? (
          <span className="forecast-card__unavailable">Forecast unavailable</span>
        ) : (
          <span className="forecast-card__loading" aria-busy="true">Requesting latest run…</span>
        )}
      </button>
    </li>
  );
}

function ForecastErrorState({
  error,
  dataMode,
  onRetry,
  onUseApi,
}: {
  error: DataError;
  dataMode: DataMode;
  onRetry: () => void;
  onUseApi?: () => void;
}) {
  const title = error.kind === 'not-found'
    ? 'No forecast run is available for this region'
    : error.kind === 'contract'
      ? 'The forecast response did not match the contract'
      : 'The forecast API could not be reached';

  return (
    <div className="state state--error forecast-state">
      <Callout tone="stop" title={title}>
        <p>{error.message}</p>
        {error.kind === 'not-found' ? (
          <p>The dashboard does not substitute frontend values when the API has no published run.</p>
        ) : null}
        {error.detail.length ? (
          <details className="state__more">
            <summary>Technical detail</summary>
            <ul>{error.detail.map((detail) => <li key={detail}><code>{detail}</code></li>)}</ul>
          </details>
        ) : null}
        <div className="state__actions">
          <button type="button" className="btn" onClick={onRetry}>Try again</button>
          {dataMode === 'demo' && onUseApi ? (
            <button type="button" className="btn btn--primary" onClick={onUseApi}>Connect to Forecast API</button>
          ) : null}
        </div>
      </Callout>
    </div>
  );
}

function ForecastRunPanel({
  payload,
  selectedIndex,
  onSelectPoint,
}: {
  payload: ForecastRunResponse;
  selectedIndex: number;
  onSelectPoint: (index: number) => void;
}) {
  const run = payload.data;
  const meta = HAZARD_META[run.hazard];
  const selectedPoint = run.points[selectedIndex] ?? run.points[0];
  const style = { '--forecast-accent': meta.accent } as CSSProperties;

  if (!selectedPoint) {
    return <EmptyView title="No forecast points published" body="The API returned a run without forecast horizons, so there is no trend or map point to display." />;
  }

  return (
    <section className="forecast-focus" style={style} aria-labelledby="forecast-focus-heading">
      <header className="forecast-focus__header">
        <div>
          <p className="forecast-kicker">Active outlook / {meta.shortLabel}</p>
          <h2 id="forecast-focus-heading">{meta.label} for {run.region.name}</h2>
          <p className="forecast-focus__lede">{meta.description}. The headline is the highest forecast probability in the published window.</p>
        </div>
        <div className="forecast-focus__headline">
          <span>Peak probability</span>
          <strong>{formatPercent(run.summary.peakProbability)}</strong>
          <span className={`risk-badge risk-badge--${run.summary.riskClass}`}>{formatRisk(run.summary.riskClass)} risk</span>
        </div>
      </header>

      <dl className="forecast-summary-stats">
        <div><dt>Window</dt><dd>{formatDateTime(run.forecastWindow.firstValidAt, run.forecastWindow.timeZone)} → {formatDateTime(run.forecastWindow.lastValidAt, run.forecastWindow.timeZone)}</dd></div>
        <div><dt>Confidence</dt><dd>{formatConfidence(run.summary.confidence)}</dd></div>
        <div><dt>Issued</dt><dd>{formatDateTime(run.issueTime, run.forecastWindow.timeZone)}</dd></div>
        <div><dt>Exposed population</dt><dd>{run.summary.exposedPopulationEstimate === null ? 'Unavailable' : `${formatNumber(run.summary.exposedPopulationEstimate)} ${run.summary.exposureUnit}`}</dd></div>
        <div><dt>Run status</dt><dd>{run.status}{run.stale ? ' · stale' : ''}</dd></div>
        <div><dt>Freshness</dt><dd>{run.summary.dataFreshnessMinutes} minutes</dd></div>
      </dl>

      <div className="forecast-workspace">
        <section className="forecast-panel forecast-panel--chart" aria-labelledby="forecast-chart-heading">
          <div className="forecast-panel__heading">
            <div>
              <p className="forecast-kicker">Probability trend</p>
              <h3 id="forecast-chart-heading">Risk by lead time</h3>
            </div>
            <span className="forecast-panel__note">Shaded area = uncertainty range</span>
          </div>
          <ForecastTrendChart
            points={run.points}
            accent={meta.accent}
            hazardLabel={meta.label}
            selectedIndex={selectedIndex}
            onSelectPoint={onSelectPoint}
          />
        </section>

        <section className="forecast-panel forecast-panel--map" aria-labelledby="forecast-map-heading">
          <div className="forecast-panel__heading">
            <div>
              <p className="forecast-kicker">Location</p>
              <h3 id="forecast-map-heading">Published forecast footprint</h3>
            </div>
            <span className="forecast-panel__note">{selectedPoint.leadTime} {selectedPoint.leadUnit}</span>
          </div>
          <ForecastMap run={run} point={selectedPoint} accent={meta.accent} />
        </section>
      </div>

      <div className="forecast-detail-grid">
        <section className="forecast-panel" aria-labelledby="forecast-horizon-heading">
          <p className="forecast-kicker">Selected horizon</p>
          <h3 id="forecast-horizon-heading">{selectedPoint.leadTime} {selectedPoint.leadUnit} ahead</h3>
          <p className="forecast-point__valid">Valid {formatDateTime(selectedPoint.validAt, run.forecastWindow.timeZone)}</p>
          <div className="forecast-point__headline">
            <strong>{formatPercent(selectedPoint.probability)}</strong>
            <span className={`risk-badge risk-badge--${selectedPoint.riskClass}`}>{formatRisk(selectedPoint.riskClass)} risk</span>
            <span>Confidence: {formatConfidence(selectedPoint.confidence)}</span>
          </div>
          <dl className="forecast-metric-list">
            {selectedPoint.metrics.map((metric) => (
              <div key={metric.id}>
                <dt>{metric.label}</dt>
                <dd>{metric.value === null ? 'Unavailable' : `${formatNumber(metric.value)} ${metric.unit}`}</dd>
              </div>
            ))}
          </dl>
          {selectedPoint.notes.length ? (
            <ul className="forecast-notes">{selectedPoint.notes.map((note) => <li key={note}>{note}</li>)}</ul>
          ) : null}
        </section>

        <section className="forecast-panel" aria-labelledby="forecast-drivers-heading">
          <p className="forecast-kicker">Model signals</p>
          <h3 id="forecast-drivers-heading">Key drivers</h3>
          <ul className="forecast-drivers">
            {run.summary.keyDrivers.map((driver) => (
              <li key={driver.id}>
                <span className={`forecast-driver__direction forecast-driver__direction--${driver.direction}`}>{directionLabel(driver.direction)}</span>
                <strong>{driver.label}</strong>
                <span>{formatDriverValue(driver)}</span>
              </li>
            ))}
          </ul>
          <details className="forecast-record">
            <summary>Model and provenance</summary>
            <dl className="forecast-record__rows">
              <div><dt>Model</dt><dd>{run.model.modelType}</dd></div>
              <div><dt>Version</dt><dd>{run.model.modelVersion}</dd></div>
              <div><dt>Calibration</dt><dd>{run.model.calibrationStatus}</dd></div>
              <div><dt>Validation</dt><dd>{run.model.validationStatus}</dd></div>
              <div><dt>Training data</dt><dd>{run.model.trainingDataStatus}</dd></div>
              <div><dt>Algorithm</dt><dd>{run.provenance.algorithmId} · {run.provenance.algorithmVersion}</dd></div>
              <div><dt>Sources</dt><dd>{run.provenance.sources.length}</dd></div>
            </dl>
            {run.model.modelCardUrl ? <a href={run.model.modelCardUrl}>Open model card</a> : null}
          </details>
        </section>
      </div>

      {payload.meta.mock ? (
        <Callout tone="warn" title="Synthetic forecast disclosure">
          <p>This response is marked synthetic by the API contract. It is suitable for integration testing, not operational warning decisions.</p>
        </Callout>
      ) : null}
      {run.warnings.length ? (
        <Callout tone="warn" title="Forecast caveats">
          <ul className="forecast-notes">{run.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </Callout>
      ) : null}
      <p className="forecast-disclaimer"><strong>Decision support only:</strong> {run.disclaimer}</p>
    </section>
  );
}

export function ForecastDashboard({
  repository,
  regionId,
  regionName,
  dataMode,
  reloadToken,
  initialHazard,
  onHazardChange,
  onRetry,
  onBack,
  onUseApi,
}: {
  repository: Repository;
  regionId: string;
  regionName: string;
  dataMode: DataMode;
  reloadToken: number;
  initialHazard?: ForecastHazard;
  onHazardChange?: (hazard: ForecastHazard) => void;
  onRetry: () => void;
  onBack: () => void;
  onUseApi?: () => void;
}) {
  const [localHazard, setLocalHazard] = useState<ForecastHazard>('flood');
  const [selectedPoints, setSelectedPoints] = useState<Record<ForecastHazard, number>>({ flood: 0, drought: 0, heat: 0 });
  const [states, setStates] = useState<ForecastStateMap>(() => makeStateMap());
  const activeHazard = initialHazard ?? localHazard;

  useEffect(() => {
    if (initialHazard) setLocalHazard(initialHazard);
  }, [initialHazard]);

  useEffect(() => {
    const controller = new AbortController();
    setStates(makeStateMap('loading'));
    setSelectedPoints({ flood: 0, drought: 0, heat: 0 });

    const requests = HAZARDS.map(async (hazard) => {
      try {
        const response = await repository.getLatestForecast(regionId, hazard, controller.signal);
        return [hazard, { status: 'ready', value: response } as ForecastState] as const;
      } catch (error) {
        return [hazard, { status: 'error', error: toDataError(error) } as ForecastState] as const;
      }
    });

    void Promise.all(requests).then((entries) => {
      if (controller.signal.aborted) return;
      setStates(Object.fromEntries(entries) as ForecastStateMap);
    });

    return () => controller.abort();
  }, [regionId, reloadToken, repository]);

  const activeState = states[activeHazard];
  const activePayload = activeState.status === 'ready' ? activeState.value : null;
  const activeIndex = selectedPoints[activeHazard];
  const activeMeta = HAZARD_META[activeHazard];
  const rootStyle = { '--forecast-accent': activeMeta.accent } as CSSProperties;

  function selectHazard(hazard: ForecastHazard) {
    setLocalHazard(hazard);
    onHazardChange?.(hazard);
  }

  function selectPoint(index: number) {
    setSelectedPoints((current) => ({ ...current, [activeHazard]: index }));
  }

  return (
    <section className="forecast-dashboard" style={rootStyle} aria-labelledby="forecast-dashboard-heading">
      <header className="forecast-hero">
        <div>
          <button type="button" className="btn btn--link forecast-back" onClick={onBack}>← Back to district analysis</button>
          <p className="forecast-kicker">Forecasting / hazard outlook</p>
          <h1 id="forecast-dashboard-heading">Flood, drought and heat risk</h1>
          <p className="forecast-hero__lede">Latest published forecasts for <strong>{regionName}</strong>. Select a hazard to inspect its probability trend, drivers and mapped footprint.</p>
        </div>
        <dl className="forecast-hero__meta">
          <div><dt>Region</dt><dd>{regionName}</dd></div>
          <div><dt>Data source</dt><dd>{dataMode === 'api' ? 'FastAPI forecast service' : 'API connection required'}</dd></div>
          <div><dt>Horizon</dt><dd>Published forecast window</dd></div>
        </dl>
      </header>

      <nav className="forecast-tabs" aria-label="Forecast hazards">
        {HAZARDS.map((hazard) => (
          <button
            key={hazard}
            type="button"
            className={activeHazard === hazard ? 'is-active' : undefined}
            aria-current={activeHazard === hazard ? 'page' : undefined}
            onClick={() => selectHazard(hazard)}
          >
            <span>{HAZARD_META[hazard].shortLabel}</span>
            <small>{states[hazard].status === 'ready' ? 'Latest run' : states[hazard].status === 'error' ? 'Unavailable' : 'Loading'}</small>
          </button>
        ))}
      </nav>

      <section className="forecast-cards" aria-labelledby="forecast-cards-heading">
        <div className="forecast-section-heading">
          <div>
            <p className="forecast-kicker">Risk summary</p>
            <h2 id="forecast-cards-heading">Hazard overview</h2>
          </div>
          <span>Click a card to open the detailed outlook</span>
        </div>
        <ul className="forecast-card-list">
          {HAZARDS.map((hazard) => (
            <ForecastHazardCard
              key={hazard}
              hazard={hazard}
              state={states[hazard]}
              active={activeHazard === hazard}
              onSelect={() => selectHazard(hazard)}
            />
          ))}
        </ul>
      </section>

      {activeState.status === 'loading' || activeState.status === 'idle' ? (
        <LoadingView what={`the ${activeMeta.shortLabel.toLowerCase()} forecast`} />
      ) : activeState.status === 'error' ? (
        <ForecastErrorState error={activeState.error} dataMode={dataMode} onRetry={onRetry} onUseApi={onUseApi} />
      ) : activePayload ? (
        <ForecastRunPanel
          payload={activePayload}
          selectedIndex={activeIndex}
          onSelectPoint={selectPoint}
        />
      ) : null}
    </section>
  );
}
