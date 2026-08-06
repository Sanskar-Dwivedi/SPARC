/* SPARC — one application, four stages.
 *
 *   orbit → locate → period → dashboard
 *
 * The globe is the front door, not the building. Every stage past it is plain
 * HTML, so the whole analytical journey stays reachable with no WebGL: the
 * landing offers "Open the terminal" as a real control, and `#/dashboard`
 * bypasses the scene entirely.
 *
 * Routing is hash-based so a deep link survives a reload on a static file
 * server with no rewrite rules — which is what the offline demo runs on. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { config, FROZEN_PERIODS, frozenPeriodsForRegion, type DataMode, type FrozenPeriod } from './config';
import type { ComparisonSelection, ForecastHazard, RegionRef } from './contract/types';
import { DataError } from './data/errors';
import { createTransport, Repository } from './data/repository';
import { DetailScreen } from './features/DetailView';
import { ForecastDashboard } from './features/ForecastDashboard';

import { ProvenanceDrawer } from './features/ProvenanceDrawer';
import { Logo } from './features/Logo';
import { ErrorView, LoadingView } from './features/StateViews';
import { Atlas } from './features/Atlas';
import { Sheet } from './features/Sheet';
import { FallbackCityView } from './features/FallbackCityView';
import { intensityFor, shapeForRegion } from './globe/overlay';
import { styleFor } from './indicators';
import { LocationConsole, PeriodConsole } from './shell/Consoles';
import { ReportConcern } from './reporting/ReportConcern';
import {
  mapDetail, mapSummary,
  userFacingLabel,
  type DetailView as DetailVM, type SummaryView as SummaryVM,
} from './viewmodel/mapper';
import { cityForRegionId, isValidatedCity, type CityCatalogEntry } from './catalog/cities';

type Stage = 'locate' | 'period' | 'dashboard';
type Route =
  | { name: 'summary' }
  | { name: 'indicator'; indicatorId: string }
  | { name: 'forecast'; hazard?: ForecastHazard };

type Async<T> =
  | { status: 'idle' } | { status: 'loading' }
  | { status: 'ready'; value: T } | { status: 'error'; error: DataError };

const DEFAULT_REGION = 'district:nagpur';
const DEFAULT_PERIOD = FROZEN_PERIODS[0]!;

/* The globe-led experience is the canonical public entry. */
const ORBIT_URL = '/';

function parseHash(hash: string): { stage: Stage; route: Route } {
  const forecast = /^#\/forecast(?:\/(flood|drought|heat))?(?:[?#]|$)/.exec(hash);
  if (forecast) {
    return {
      stage: 'dashboard',
      route: { name: 'forecast', hazard: forecast[1] as ForecastHazard | undefined },
    };
  }
  const ind = /^#\/dashboard\/([a-z0-9-]{1,64})/.exec(hash);
  if (ind?.[1]) return { stage: 'dashboard', route: { name: 'indicator', indicatorId: ind[1] } };
  if (hash.startsWith('#/dashboard')) return { stage: 'dashboard', route: { name: 'summary' } };
  return { stage: 'locate', route: { name: 'summary' } };
}

/* Coordinates handed over by the globe: #/locate?lat=..&lon=..&name=.. */
function handoffFromHash(hash: string): { lat: number; lon: number; name: string } | null {
  const q = hash.indexOf('?');
  if (q < 0) return null;
  const params = new URLSearchParams(hash.slice(q + 1));
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, name: params.get('name') ?? 'the selected point' };
}

export interface PanelMode {
  target: { lat: number; lon: number; name: string };
  onClose: () => void;
}

export default function App({ panel }: { panel?: PanelMode } = {}) {
  /* In panel mode the globe already answered "where", and routing must not
     touch location.hash — the globe owns the URL. So navigation is local
     state. Standalone keeps the hash router for shareable deep links. */
  const [panelNav, setPanelNav] = useState<{ stage: Stage; route: Route }>(
    { stage: 'locate', route: { name: 'summary' } },
  );
  const [hashNav, setNav] = useState(() => parseHash(location.hash));
  const { stage, route } = panel ? panelNav : hashNav;
  const [dataMode, setDataMode] = useState<DataMode>(config.dataMode);
  const [regionId, setRegionId] = useState<string>(DEFAULT_REGION);
  const [period, setPeriod] = useState<FrozenPeriod>(FROZEN_PERIODS[0]);
  const [regions, setRegions] = useState<RegionRef[]>([]);
  const [summary, setSummary] = useState<Async<SummaryVM>>({ status: 'idle' });
  const [detail, setDetail] = useState<Async<DetailVM>>({ status: 'idle' });
  const [reloadToken, setReloadToken] = useState(0);
  // CODEX PROTOTYPE HANDOFF: Claude should replace this local shell with the
  // reviewed reporting transport once the browser contract is consumed.
  const [reportOpen, setReportOpen] = useState(false);
  /* The provenance drawer is opened from an indicator row or from the detail
     screen, so its subject is whichever comparison was last asked about — not
     whichever route is active. Holding it here rather than in either screen is
     what lets the drawer survive navigating between them. */
  const [provSubject, setProvSubject] = useState<DetailVM | null>(null);
  const [provOpen, setProvOpen] = useState(false);
  /* Comparisons for every indicator on screen, fetched once the summary lands.
     The story's coverage donut and sensitivity range live on the comparison,
     not the summary — without this the chapters could only show what the
     summary carried, which is the delta and nothing that qualifies it. */
  const [evidence, setEvidence] = useState<Record<string, DetailVM>>({});
  /* Which measurement's evidence is open in the sheet. Held here rather than in
     the route so opening it does not navigate away from the map — the reader
     closes the sheet and is exactly where they were, same zoom, same
     indicator. */
  const [sheetId, setSheetId] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  const repository = useMemo(() => new Repository(createTransport(dataMode)), [dataMode]);
  const catalogCity: CityCatalogEntry | null = cityForRegionId(regionId);
  const cityHasValidatedPack = isValidatedCity(catalogCity);
  const availablePeriods = useMemo(() => frozenPeriodsForRegion(regionId), [regionId]);

  const selection: ComparisonSelection = useMemo(() => ({
    regionId,
    baselineStart: period.baselineStart,
    baselineEnd: period.baselineEnd,
    comparisonStart: period.comparisonStart,
    comparisonEnd: period.comparisonEnd,
  }), [regionId, period]);

  useEffect(() => {
    if (panel) return;
    const onHash = () => setNav(parseHash(location.hash));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, [panel]);

  useEffect(() => {
    const ac = new AbortController();
    repository.listRegions(ac.signal)
      .then((list) => setRegions(list.filter((r) => r.type === 'district')))
      .catch(() => setRegions([]));
    return () => ac.abort();
  }, [repository]);

  // Only fetch once the user has actually reached the dashboard.
  useEffect(() => {
    if (stage !== 'dashboard' || route.name === 'forecast' || (catalogCity && !cityHasValidatedPack)) {
      if (route.name === 'forecast' || (catalogCity && !cityHasValidatedPack)) setSummary({ status: 'idle' });
      return;
    }
    const ac = new AbortController();
    setSummary({ status: 'loading' });
    repository.getRegionSummary(selection, ac.signal)
      .then((r) => setSummary({ status: 'ready', value: mapSummary(r, repository.label) }))
      .catch((e: unknown) => { if (!ac.signal.aborted) setSummary({ status: 'error', error: toDataError(e) }); });
    return () => ac.abort();
  }, [repository, selection, stage, route.name, reloadToken, catalogCity, cityHasValidatedPack]);

  useEffect(() => {
    if (stage !== 'dashboard' || route.name !== 'indicator' || (catalogCity && !cityHasValidatedPack)) { setDetail({ status: 'idle' }); return; }
    const ac = new AbortController();
    setDetail({ status: 'loading' });
    repository.getIndicatorComparison(selection, route.indicatorId, ac.signal)
      .then((r) => setDetail({ status: 'ready', value: mapDetail(r, repository.label) }))
      .catch((e: unknown) => { if (!ac.signal.aborted) setDetail({ status: 'error', error: toDataError(e) }); });
    return () => ac.abort();
  }, [repository, selection, stage, route, reloadToken, catalogCity, cityHasValidatedPack]);

  /* preventScroll: moving focus to <main> is for keyboard users, but the
     browser's default "scroll it into view" also pushed the district heading up
     under the sticky header block on every arrival. */
  useEffect(() => {
    if (stage === 'dashboard') mainRef.current?.focus({ preventScroll: true });
  }, [stage, route.name]);

  /* The globe owns its own scene, so the panel does not reach into it — it
     announces which indicator is in focus and the globe recolours its marker
     if it feels like it. One-way, so neither side can break the other. */
  useEffect(() => {
    const id = stage === 'dashboard' && route.name !== 'forecast'
      ? route.name === 'indicator' ? route.indicatorId : null
      : null;
    dispatchEvent(new CustomEvent('sparc:indicator', { detail: { indicatorId: id } }));
  }, [stage, route]);

  /* Choropleth patch for the district in view. Sent whenever the district or
     the focused indicator changes; cleared when the panel leaves the results,
     because a patch left behind on the globe would keep asserting a selection
     that is no longer current. */
  useEffect(() => {
    if (stage !== 'dashboard' || route.name === 'forecast') {
      dispatchEvent(new CustomEvent('sparc:district', { detail: null }));
      return;
    }
    const shape = shapeForRegion(regionId);
    if (!shape) return;

    /* Point the globe at it. Picking a district from the list previously left
       the planet wherever it happened to be, so the patch was often drawn on
       the far side and the user saw nothing happen. */
    const centre = summary.status === 'ready' ? summary.value : null;
    const globe = (window as unknown as { __orbital?: { goTo?: (lat: number, lon: number, name: string) => void } }).__orbital;
    if (centre && globe?.goTo) {
      const [w, s2, e, n] = centre.bbox;
      globe.goTo((s2 + n) / 2, (w + e) / 2, centre.regionName);
    }

    const focused = route.name === 'indicator' ? route.indicatorId : null;
    const card = summary.status === 'ready'
      ? summary.value.indicators.find((i) => (focused ? i.id === focused : true))
      : undefined;

    dispatchEvent(new CustomEvent('sparc:district', {
      detail: {
        rings: shape.rings,
        approximate: shape.approximate,
        colour: Number(styleFor(focused ?? 'surface-water').accent.replace('#', '0x')),
        intensity: intensityFor(card?.metric.percentRaw ?? null),
      },
    }));
  }, [stage, regionId, route, summary]);

  /* Indicator rows fetch their own evidence on first expand: the summary
     payload has no sensitivity, scene count or coverage in it, and a row that
     expanded into numbers the summary never carried would be inventing them. */
  const loadEvidence = useCallback(
    (indicatorId: string) => repository
      .getIndicatorComparison(selection, indicatorId)
      .then((r) => mapDetail(r, repository.label)),
    [repository, selection],
  );

  useEffect(() => {
    if (summary.status !== 'ready') return;
    let live = true;
    setEvidence({});
    for (const card of summary.value.indicators) {
      repository.getIndicatorComparison(selection, card.id)
        .then((r) => {
          if (!live) return;
          setEvidence((prev) => ({ ...prev, [card.id]: mapDetail(r, repository.label) }));
        })
        // A chapter without its evidence still renders its delta and its
        // caveat; it simply omits the marks it has no numbers for.
        .catch(() => undefined);
    }
    return () => { live = false; };
  }, [summary, repository, selection]);

  const openProvenance = useCallback((subject: DetailVM) => {
    setProvSubject(subject);
    setProvOpen(true);
  }, []);

  const go = useCallback((hash: string) => { location.hash = hash; }, []);
  const openIndicator = useCallback((id: string) => {
    if (panel) setPanelNav({ stage: 'dashboard', route: { name: 'indicator', indicatorId: id } });
    else go(`#/dashboard/${id}`);
  }, [panel, go]);
  const backToSummary = useCallback(() => {
    if (panel) setPanelNav({ stage: 'dashboard', route: { name: 'summary' } });
    else go('#/dashboard');
  }, [panel, go]);
  const openForecast = useCallback(() => {
    if (panel) setPanelNav({ stage: 'dashboard', route: { name: 'forecast' } });
    else go('#/forecast');
  }, [panel, go]);
  const selectForecastHazard = useCallback((hazard: ForecastHazard) => {
    if (panel) setPanelNav({ stage: 'dashboard', route: { name: 'forecast', hazard } });
    else go(`#/forecast/${hazard}`);
  }, [panel, go]);
  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  /* Resolution lives in LocationConsole and nowhere else. It previously also
     happened here, and the two disagreed: this one silently switched to the
     location step while the console — which owns the explanation — never
     learned a target had been rejected. Targeting Mumbai therefore re-asked
     "where?" with no reason given. */
  const regionName = userFacingLabel(catalogCity?.name ?? regions.find((r) => r.id === regionId)?.name ?? 'this district');

  /* ── stages before the dashboard ───────────────────────────────────────── */
  if (stage === 'locate' || stage === 'period') {
    return (
      <div className="handoff">
        {stage === 'locate' ? (
          <LocationConsole
            /* The real list, never a stand-in. A one-element fallback here made
               "still loading" indistinguishable from "only Nagpur exists", so the
               console auto-resolved an incoming target against an incomplete list
               and refused London — which it does have. The console waits instead. */
            regions={regions}
            onResolved={(id) => {
              setRegionId(id);
              setPeriod(frozenPeriodsForRegion(id)[0] ?? DEFAULT_PERIOD);
              setSummary({ status: 'idle' });
              setDetail({ status: 'idle' });
              const pickedCity = cityForRegionId(id);
              if (pickedCity && !isValidatedCity(pickedCity)) {
                const next = { stage: 'dashboard' as Stage, route: { name: 'summary' as const } };
                if (panel) setPanelNav(next); else setNav(next);
                return;
              }
              /* Each accepted district has a frozen comparison window. Keep
                 the period step explicit so a district cannot accidentally be
                 queried with another district's dates. */
              const next = FROZEN_PERIODS.length > 1
                ? { stage: 'period' as Stage, route: { name: 'summary' as const } }
                : { stage: 'dashboard' as Stage, route: { name: 'summary' as const } };
              if (panel) setPanelNav(next); else setNav(next);
            }}
            handoff={panel ? panel.target : handoffFromHash(location.hash)}
            /* Only stable packaged regions belong in the primary picker. The
               generated quick-target cards remain an internal fixture aid
               until accepted precomputed outputs are connected. */
            showDemoCities={false}
            onCancel={() => { location.href = ORBIT_URL; }}
          />
        ) : (
          <PeriodConsole
            regionName={regionName}
            periods={availablePeriods}
            onChosen={(p) => {
              setPeriod(p);
              if (panel) setPanelNav({ stage: 'dashboard', route: { name: 'summary' } });
              else go('#/dashboard');
            }}
            onBack={() => {
              /* In the globe drawer, the × is a dismiss control: returning to
                 the standalone location route would leave the drawer open and
                 make the control appear inert. Standalone keeps the two-step
                 flow and returns to location selection. */
              if (panel) panel.onClose();
              else setNav({ stage: 'locate', route: { name: 'summary' } });
            }}
          />
        )}
      </div>
    );
  }

  /* ── dashboard ─────────────────────────────────────────────────────────── */
  const fallbackCity = catalogCity && !cityHasValidatedPack ? catalogCity : null;


  return (
    <div className="app">
      <a className="skip" href="#main">Skip to results</a>

      {/* One thin sticky bar. The story carries the identity; the chrome only
          needs to keep the two exits reachable. */}
      <div className="shellhead">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="brand__sub">{regionName} · {route.name === 'forecast' ? 'Hazard outlook' : fallbackCity ? 'Report/export scope' : period.label}</span>
        </div>
        <div className="topbar__actions">
          <button type="button" className="btn" onClick={route.name === 'forecast' ? backToSummary : openForecast}>
            {route.name === 'forecast' ? 'Analysis' : 'Forecasts'}
          </button>
          <button
            type="button" className="btn"
            onClick={() => (panel
              ? setPanelNav({ stage: 'locate', route: { name: 'summary' } })
              : go('#/locate'))}
          >
            {fallbackCity ? 'Change location' : 'Change period'}
          </button>
          <button
            type="button" className="btn btn--ghost" data-autofocus
            onClick={() => (panel ? panel.onClose() : (location.href = ORBIT_URL))}
          >
            {panel ? 'Close' : 'Back to orbit'}
          </button>
        </div>
      </header>

      </div>

      <main id="main" ref={mainRef} tabIndex={-1} className={`main${route.name === 'forecast' ? ' main--forecast' : ''}`}>
        {fallbackCity && route.name !== 'forecast' ? (
          <FallbackCityView city={fallbackCity} onReport={() => setReportOpen(true)} />
        ) : route.name === 'summary' ? (
          summary.status === 'loading' || summary.status === 'idle' ? (
            <LoadingView what="the district summary" />
          ) : summary.status === 'error' ? (
            <ErrorView
              error={summary.error} onRetry={retry}
              onResetPeriods={() => setPeriod(availablePeriods[0] ?? DEFAULT_PERIOD)}
              canUseOffline={dataMode === 'api'}
              onUseOffline={() => setDataMode('demo')}
            />
          ) : (
            <Atlas
              summary={summary.value}
              evidence={evidence}
              onOpenEvidence={setSheetId}
              onOpenProvenance={openProvenance}
              onReport={() => setReportOpen(true)}
            />
          )
        ) : route.name === 'forecast' ? (
          <ForecastDashboard
            repository={repository}
            regionId={regionId}
            regionName={regionName}
            dataMode={dataMode}
            reloadToken={reloadToken}
            initialHazard={route.hazard}
            onHazardChange={selectForecastHazard}
            onRetry={retry}
            onBack={backToSummary}
            onUseApi={dataMode === 'demo' ? () => setDataMode('api') : undefined}
          />
        ) : detail.status === 'loading' || detail.status === 'idle' ? (
          <LoadingView what="the indicator result" />
        ) : detail.status === 'error' ? (
          <>
            <nav aria-label="Breadcrumb" className="crumb">
              <button type="button" className="btn btn--link" onClick={backToSummary}>
                ← Back to district summary
              </button>
            </nav>
            <ErrorView
              error={detail.error} onRetry={retry}
              onResetPeriods={() => setPeriod(availablePeriods[0] ?? DEFAULT_PERIOD)}
              canUseOffline={dataMode === 'api'}
              onUseOffline={() => setDataMode('demo')}
            />
          </>
        ) : (
          <DetailScreen
            detail={detail.value}
            onBack={backToSummary}
            onOpenProvenance={() => openProvenance(detail.value)}
          />
        )}

      </main>

      <footer className="foot">
        <p>Contract {config.contractVersion} · No official SDG claim, no causal claim.</p>
      </footer>

      {/* Evidence rises over the atlas; the map stays behind it. */}
      <Sheet
        open={sheetId !== null && !!evidence[sheetId]}
        title={sheetId ? evidence[sheetId]?.indicatorName ?? 'Evidence' : 'Evidence'}
        onClose={() => setSheetId(null)}
      >
        {(() => {
          const shown = sheetId ? evidence[sheetId] : undefined;
          if (!shown) return null;
          return (
            <DetailScreen
              detail={shown}
              onBack={() => setSheetId(null)}
              onOpenProvenance={() => openProvenance(shown)}
            />
          );
        })()}
      </Sheet>

      <ProvenanceDrawer
        detail={provSubject ?? (detail.status === 'ready' ? detail.value : null)}
        open={provOpen}
        onClose={() => setProvOpen(false)}
      />

      <ReportConcern
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        regionName={regionName}
        regionId={regionId}
        analysisSnapshot={summary.status === 'ready' ? summary.value : undefined}
        coordinates={regions.find((region) => region.id === regionId)?.centroid}
        catalogEntry={catalogCity ?? undefined}
      />
    </div>
  );
}

function toDataError(err: unknown): DataError {
  if (err instanceof DataError) return err;
  return new DataError('server', String((err as Error)?.message ?? err));
}
