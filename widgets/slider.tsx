import React, { useCallback, useRef } from 'react';

export interface IMenuSliderItem {
  value: number;
  label?: string;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step: number;
  id: string;
  options: { value: number; label?: string }[];
}

export const Slider = ({
  value,
  label,
  onChange,
  min,
  max,
  step,
  id,
  options,
}: IMenuSliderItem) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFocus = useCallback(() => inputRef.current?.focus(), []);
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.stopPropagation();
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.valueAsNumber),
    [onChange],
  );

  return (
    <div role="slider" tabIndex={-1} onFocus={handleFocus}>
      {label && <label htmlFor={id}>{label}</label>}

      <div className="slider">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={handleChange}
          list={id}
          step={step}
          tabIndex={-1}
          ref={inputRef}
          onKeyDown={handleKeyDown}
          title={value.toString()}
        />

        <datalist id={id}>
          {options.map((o, i) => (
            <option value={o.value} key={`${o.value}-${i}`}>
              {o.label}
            </option>
          ))}
        </datalist>
      </div>
    </div>
  );
};
