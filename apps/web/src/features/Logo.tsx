/* The SPARC mark.
 *
 * Inline SVG rather than an <img> for three reasons that all matter here:
 * it inherits `currentColor`, so one mark serves the dark drawer and any
 * light context without a second asset; it is vector, so it stays sharp when
 * the panel is projected or shown on a high-DPI display; and it costs no
 * request, which the offline gate requires — nothing about the brand may
 * depend on the network at run time.
 *
 * The wordmark is real text, not outlines. A drawn wordmark cannot be
 * selected, searched, translated or read aloud, and the geometric face is
 * approximated closely enough with tracking that outlining it would trade
 * those things for very little.
 */

export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="logo">
      <svg className="logo__mark" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <path d="M4 44 L110 4 L50 44 L50 56 L32 64 L4 64 Z" />
        <path d="M6 118 L96 52 L56 52 Z" />
      </svg>
      {/* The name is announced exactly once. When the wordmark is rendered it
          is real, readable text and carries the name itself; only the
          mark-only variant needs a visually hidden stand-in. Emitting both
          would have a screen reader say "SPARC SPARC". */}
      {withWordmark
        ? <span className="logo__word">SPARC</span>
        : <span className="sr-only">SPARC</span>}
    </span>
  );
}
