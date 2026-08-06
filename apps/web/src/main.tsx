import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import './styles.css';
import './stage.css';
import './panel.css';
import './cards.css';
import './picker.css';
import './viz.css';
import './reporting/reporting.css';
/* Last, so the interface system layers over the base dashboard styles on
   source order rather than by escalating selector weight. */
import './system.css';
import './forecast.css';
import { installInteractions } from './interact';

/* The one scripted piece of the motion budget (§4.3). Installed at module
   scope, delegated and idempotent, so it costs a single observer whether or not
   the panel is ever opened. */
installInteractions();

/* Top-level boundary. A render crash must not leave a blank page: the whole
   point of the offline demo is that it degrades to something a presenter can
   still talk from. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[sparc] unhandled render error', error, info.componentStack);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="callout callout--stop" role="alert">
        <p className="callout__title">The panel failed to render</p>
        <div className="callout__body">
          <p>{this.state.error.message}</p>
          <p>The underlying results are immutable JSON under <code>contracts/examples/</code>.</p>
        </div>
      </div>
    );
  }
}

/* ── panel API ───────────────────────────────────────────────────────────────
   The globe is a build-free ES-module page; it cannot import React. So this
   bundle publishes a tiny imperative surface on `window.SPARC` and the globe
   calls it. The dashboard is mounted on demand into a fixed side drawer over
   the canonical globe entry.

   Mounting lazily matters: opening the panel is the first moment the analytics
   are needed, and until then the globe should not pay for a React tree. */
export interface PanelTarget { lat: number; lon: number; name: string }

let panelRoot: Root | null = null;
let panelHost: HTMLElement | null = null;
let panelWidth = Math.min(672, Math.round((typeof innerWidth === 'number' ? innerWidth : 1280) * 0.46));

function ensureHost(): HTMLElement {
  if (panelHost) return panelHost;
  const el = document.createElement('aside');
  el.id = 'sparc-panel';
  el.className = 'sparc-panel';
  el.setAttribute('aria-label', 'SPARC district analysis');

  /* Drag handle. The panel covers the globe, and how much of each you want to
     see depends on what you are doing — reading provenance wants width, watching
     the beam land wants the planet. Width persists for the session so it does
     not reset every time the panel is reopened. */
  const grip = document.createElement('div');
  grip.className = 'sparc-panel__grip';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-orientation', 'vertical');
  grip.setAttribute('aria-label', 'Resize panel');
  grip.tabIndex = 0;

  const MIN = 22 * 16;
  const clampWidth = (px: number) =>
    Math.max(MIN, Math.min(px, Math.round(innerWidth * 0.96)));
  const applyWidth = (px: number) => {
    panelWidth = clampWidth(px);
    el.style.width = `${panelWidth}px`;
  };

  let dragging = false;
  grip.addEventListener('pointerdown', (e) => {
    dragging = true;
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('sparc-resizing');
    e.preventDefault();
  });
  addEventListener('pointermove', (e) => {
    if (dragging) applyWidth(innerWidth - e.clientX);
  });
  addEventListener('pointerup', () => {
    dragging = false;
    document.body.classList.remove('sparc-resizing');
  });
  // Keyboard equivalent: a drag handle reachable only by pointer is not a control.
  grip.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 96 : 24;
    if (e.key === 'ArrowLeft') { applyWidth(panelWidth + step); e.preventDefault(); }
    if (e.key === 'ArrowRight') { applyWidth(panelWidth - step); e.preventDefault(); }
  });

  el.appendChild(grip);
  document.body.appendChild(el);
  applyWidth(panelWidth);
  panelHost = el;
  return el;
}

function openPanel(target: PanelTarget) {
  if (teardown) { clearTimeout(teardown); teardown = null; }
  const host = ensureHost();
  host.classList.add('sparc-panel--open');
  document.documentElement.classList.add('sparc-panel-open');
  let mount = host.querySelector<HTMLElement>('.sparc-panel__mount');
  if (!mount) {
    mount = document.createElement('div');
    mount.className = 'sparc-panel__mount';
    host.appendChild(mount);
  }
  if (!panelRoot) panelRoot = createRoot(mount);
  panelRoot.render(
    <StrictMode>
      <Boundary>
        <App panel={{ target, onClose: closePanel }} />
      </Boundary>
    </StrictMode>,
  );
  // Move focus in, or a keyboard user is left behind on the globe.
  requestAnimationFrame(() => host.querySelector<HTMLElement>('[data-autofocus]')?.focus());
}

let teardown: ReturnType<typeof setTimeout> | null = null;

function closePanel() {
  panelHost?.classList.remove('sparc-panel--open');
  document.documentElement.classList.remove('sparc-panel-open');
  dispatchEvent(new CustomEvent('sparc:district', { detail: null }));

  /* Unmount after the slide-out finishes. Keeping the tree alive would keep
     its state too, so reopening would drop you back on whatever indicator you
     were last reading instead of the district summary. The panel is a fresh
     question every time it is asked. */
  if (teardown) clearTimeout(teardown);
  teardown = setTimeout(() => {
    panelRoot?.unmount();
    panelRoot = null;
    teardown = null;
  }, 460);
}

declare global {
  interface Window {
    SPARC?: { open: (t: PanelTarget) => void; close: () => void };
  }
}
window.SPARC = { open: openPanel, close: closePanel };

/* Development fallback: Vite can still mount the dashboard when this bundle is
   opened directly. The combined production server redirects /app/ to the
   globe, so users see one public experience. */
const standalone = document.getElementById('root');
if (standalone) {
  createRoot(standalone).render(
    <StrictMode><Boundary><App /></Boundary></StrictMode>,
  );
}
