/* One designed view per failure kind.
 *
 * docs/project-status.md requires every contract/client failure state to have
 * "visible, keyboard-accessible recovery behaviour". So each of these says what
 * happened, what it means for the data, and offers the action that actually
 * recovers it — which for most transport failures is switching to the offline
 * pack, since that path needs no server at all. */

import type { DataError, DataErrorKind } from '../data/errors';
import { Callout } from './Primitives';

/* Loading (§5): hairline-outlined placeholders in the shape of the rows that
 * are coming, with one slow opacity pulse. Not a skeleton shimmer gradient, and
 * not a spinner — the layout of the answer is already known, so showing it
 * stops the page reflowing under the reader when the data lands. */
export function LoadingView({ what }: { what: string }) {
  return (
    // aria-busy + a polite live region: a screen reader user gets told the
    // fetch started without the announcement stealing focus. The placeholders
    // themselves are hidden from it — three pulsing bars are noise, not news.
    <div aria-busy="true" aria-live="polite">
      <p className="state state--loading">Loading {what}…</p>
      <ul className="ghost" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li className="ghost__row" key={i} style={{ animationDelay: `${i * 120}ms` }}>
            <span className="ghost__bar ghost__bar--short" />
            <span className="ghost__bar ghost__bar--num" />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Recovery {
  title: string;
  body: string;
  /** What the user can do about it, in the order they should try. */
  actions: ('retry' | 'offline' | 'reset-periods')[];
}

const RECOVERY: Record<DataErrorKind, Recovery> = {
  offline: {
    title: 'The browser is offline',
    body: 'The offline analysis package is bundled with this page and needs no network. Switching to it restores the full journey.',
    actions: ['offline'],
  },
  unreachable: {
    title: 'The API did not respond',
    body: 'The FastAPI process may not be running, or it may not allow this origin. Nothing is wrong with the data — only the route to it.',
    actions: ['offline', 'retry'],
  },
  'not-found': {
    title: 'No precomputed result for this selection',
    body: 'SPARC serves immutable results only. A selection with no packaged result returns nothing rather than computing one on demand.',
    actions: ['reset-periods', 'offline'],
  },
  'invalid-input': {
    title: 'That selection is not supported',
    body: 'Only the frozen same-season comparison windows are accepted. The server re-checks this independently of the browser.',
    actions: ['reset-periods'],
  },
  'rate-limited': {
    title: 'Too many requests',
    body: 'The local API applies a fixed-window limit. Wait a moment before retrying.',
    actions: ['retry', 'offline'],
  },
  upstream: {
    title: 'A dependency is unavailable',
    body: 'The API is reachable but something it depends on is not. The offline pack does not depend on it.',
    actions: ['offline', 'retry'],
  },
  server: {
    title: 'The API failed',
    body: 'The server returned an error. Diagnostic detail stays server-side by design.',
    actions: ['offline', 'retry'],
  },
  contract: {
    title: 'The response did not match the frozen contract',
    body: 'It was rejected rather than rendered. Displaying a payload that failed validation risks showing a result without its caveats, which is worse than showing nothing.',
    actions: ['offline'],
  },
  cancelled: {
    title: 'Request superseded',
    body: 'A newer selection replaced this one.',
    actions: ['retry'],
  },
};

export function ErrorView({
  error,
  onRetry,
  onUseOffline,
  onResetPeriods,
  canUseOffline,
}: {
  error: DataError;
  onRetry?: () => void;
  onUseOffline?: () => void;
  onResetPeriods?: () => void;
  canUseOffline: boolean;
}) {
  const recovery = RECOVERY[error.kind];
  const problem = error.problem;

  return (
    <div className="state state--error">
      <Callout tone="stop" title={recovery.title}>
        <p>{recovery.body}</p>
        <p className="state__detail">{error.message}</p>

        {problem?.invalidParams?.length ? (
          <ul className="state__params">
            {problem.invalidParams.map((p) => (
              <li key={p.name}>
                <code>{p.name}</code> — {p.reason}
              </li>
            ))}
          </ul>
        ) : null}

        {error.detail.length ? (
          <details className="state__more">
            <summary>Technical detail</summary>
            <ul>{error.detail.map((d) => <li key={d}><code>{d}</code></li>)}</ul>
          </details>
        ) : null}

        <div className="state__actions">
          {recovery.actions.includes('offline') && canUseOffline && onUseOffline ? (
            <button type="button" className="btn btn--primary" onClick={onUseOffline}>
              Switch to offline analysis package
            </button>
          ) : null}
          {recovery.actions.includes('reset-periods') && onResetPeriods ? (
            <button type="button" className="btn" onClick={onResetPeriods}>
              Reset to the frozen comparison window
            </button>
          ) : null}
          {recovery.actions.includes('retry') && onRetry ? (
            <button type="button" className="btn" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </div>
      </Callout>
    </div>
  );
}

export function EmptyView({ title, body }: { title: string; body: string }) {
  return (
    <div className="state state--empty">
      <Callout tone="info" title={title}>
        <p>{body}</p>
      </Callout>
    </div>
  );
}
