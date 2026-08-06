/* The motion budget — UI design doc §4.3.
 *
 * This module used to do rather more: pointer-tracked light on every card, a
 * 3° tilt, a crosshair following the cursor, buttons filling from the point you
 * aimed at. All of it is gone, because §4.3 allows one orchestrated moment and
 * calls everything else scattered effects. The load sequence is the ledger
 * strip populating its fields, and that is pure CSS in system.css — it needs no
 * script at all.
 *
 * What is left is the one thing the layout genuinely cannot do on its own:
 * staggering rows that arrive after a selection changes. Sixty milliseconds
 * between rows, capped, per §4.3.
 *
 * ── the constraint that shapes the implementation ────────────────────────────
 * A stagger must never be able to leave a measurement invisible. So the hidden
 * state is applied by this script rather than declared in the sheet, and any
 * row already on screen is queued visible on the very next frame instead of
 * waiting for an intersection that has already happened. If the script does not
 * run, every row renders immediately and fully — which is also exactly what
 * happens under `prefers-reduced-motion`.
 */

const STAGGER_MS = 60;
const MAX_STEPS = 5;

/* Groups that arrive together after a selection change. Nothing else in the
   interface animates in. */
const GROUPS: Array<[container: string, item: string]> = [
  ['.story', ':scope > section'],
  ['.standing__grid', ':scope > p'],
  ['.main', ':scope > .panel'],
];

function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function installStagger(): void {
  const seen = new WeakSet<Element>();

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });

  const arm = (el: HTMLElement, index: number) => {
    if (seen.has(el)) return;
    seen.add(el);
    el.dataset.spIn = '';
    el.style.transitionDelay = `${Math.min(index, MAX_STEPS) * STAGGER_MS}ms`;

    /* Already on screen: there is no future intersection to wait for, so queue
       it visible next frame. This is the rule that makes it impossible for a
       missed callback to hide a number. */
    const box = el.getBoundingClientRect();
    if (box.top < innerHeight && box.bottom > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
      return;
    }
    observer.observe(el);
  };

  const scan = () => {
    for (const [container, item] of GROUPS) {
      for (const host of document.querySelectorAll(container)) {
        host.querySelectorAll<HTMLElement>(item).forEach(arm);
      }
    }
  };

  /* React mounts and re-renders the tree after this module runs, so a one-shot
     scan would only ever see an empty document.

     The element filter is not a micro-optimisation: this bundle is also loaded
     by the globe page, where the telemetry row rewrites four text nodes every
     animation frame. Without it, the globe would pay for a sweep at 60 Hz for
     the whole session whether or not the panel was ever opened. */
  let pending = 0;
  const addsElement = (records: MutationRecord[]) => records.some((r) => {
    for (const node of r.addedNodes) if (node.nodeType === 1) return true;
    return false;
  });

  new MutationObserver((records) => {
    if (pending || !addsElement(records)) return;
    pending = requestAnimationFrame(() => { pending = 0; scan(); });
  }).observe(document.body, { childList: true, subtree: true });

  scan();
}

let installed = false;

export function installInteractions(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  if (reducedMotion()) return;

  const start = () => installStagger();
  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
}
