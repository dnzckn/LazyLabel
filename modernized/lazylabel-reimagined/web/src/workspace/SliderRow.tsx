/**
 * Legacy's slider row: a short label, the type-in box, then the slider, as both of the Image tab's
 * groups build theirs (`adjustments_widget.py:40-63`, `annotation_settings_widget.py:35-67`).
 *
 * One component for both, since the two groups' rows are one helper each in legacy that differ
 * only in their scaling. It lived in `AdjustmentsPanel.tsx` until Annotation Settings became a
 * group of its own (2026-09-29).
 */

import { useEffect, useState, type ReactNode } from "react";

export function SliderRow({
  label,
  name,
  tooltip,
  min,
  max,
  value,
  display,
  scale,
  onChange,
}: {
  /** What the row shows, which is legacy's short label. */
  readonly label: string;
  /** What the slider is called to a screen reader, where "Bright:" would be a clipped word. */
  readonly name: string;
  readonly tooltip: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly display?: string;
  /** Slider steps per unit shown, for a value typed in: gamma 100, size 10. None: whole numbers. */
  readonly scale?: number;
  readonly onChange: (value: number) => void;
}): ReactNode {
  /*
   * LEGACY'S TYPE-IN BOX beside each slider (adjustments_widget.py:40-60, 150-205;
   * annotation_settings_widget.py:40-60, 125-167). On Enter or leaving it, the text is read as
   * legacy's does -- `int(text)`, or `int(float(text) * scale)`, which truncates -- clamped to the
   * slider's range and applied; text that is not a number goes back to the value (CP-51, RULE-050).
   */
  const shown = display ?? String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const trimmed = text.trim();
    const typed = scale === undefined ? (/^[+-]?\d+$/.test(trimmed) ? Number(trimmed) : NaN) : Number(trimmed);
    if (trimmed === "" || !Number.isFinite(typed)) {
      setText(shown);
      return;
    }
    const next = Math.max(min, Math.min(max, Math.trunc(scale === undefined ? typed : typed * scale)));
    if (next === value) setText(shown);
    else onChange(next);
  };
  return (
    <label className="adjustment" title={tooltip}>
      <span className="adjustment__label">
        {label}{" "}
        <input
          type="text"
          className="adjustment__value"
          size={4}
          value={text}
          aria-label={`${name}, typed`}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
        />
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={name}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
