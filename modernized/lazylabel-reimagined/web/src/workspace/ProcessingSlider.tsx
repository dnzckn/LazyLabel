/**
 * A labelled range slider with its value, for the rescale window and the frequency cutoff.
 *
 * Laid out like legacy's slider rows (`.adjustment`): the name, the value, then the slider.
 */

import type { ReactNode } from "react";

export function ProcessingSlider({
  label,
  max,
  value,
  onChange,
}: {
  readonly label: string;
  readonly max: number;
  readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactNode {
  return (
    <label className="adjustment">
      <span className="adjustment__label">
        {label} <span className="adjustment__value">{value}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
