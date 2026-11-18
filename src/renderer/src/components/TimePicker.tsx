import { useEffect, useMemo, useRef, useState } from 'react';

type TimePickerProps = {
  startTime: string;
  endTime: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

type PartField = 'hour' | 'minute' | 'period';

const splitTime = (value: string) => {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return { hour: '7', minute: '00', period: 'AM' };
  const hour24 = Number(match[1]);
  return {
    hour: String(hour24 % 12 || 12),
    minute: match[2],
    period: hour24 < 12 ? 'AM' : 'PM'
  };
};

const mergeTime = (hour: string, minute: string, period: string) => {
  let hour24 = Number(hour) % 12;
  if (period === 'PM') hour24 += 12;
  return `${String(hour24).padStart(2, '0')}:${minute}`;
};

function CustomSelect({
  ariaLabel,
  value,
  options,
  isOpen,
  onToggle,
  onSelect
}: {
  ariaLabel: string;
  value: string;
  options: string[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (next: string) => void;
}) {
  return (
    <div
      className="custom-time-select"
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <button
        type="button"
        className={`custom-time-trigger ${isOpen ? 'open' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }}
      >
        <span>{value}</span>
        <span className="custom-time-caret" aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div
          className="custom-time-menu"
          role="listbox"
          aria-label={ariaLabel}
          onClick={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
        >
          {options.map(option => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              className={`custom-time-option ${option === value ? 'selected' : ''}`}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                onSelect(option);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimeColumn({
  label,
  value,
  openField,
  setOpenField,
  onChange
}: {
  label: 'Start' | 'End';
  value: string;
  openField: string | null;
  setOpenField: (field: string | null) => void;
  onChange: (value: string) => void;
}) {
  const parts = splitTime(value);
  const hours = useMemo(() => Array.from({ length: 12 }, (_, index) => String(index + 1)), []);
  const minutes = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0')),
    []
  );
  const periods = useMemo(() => ['AM', 'PM'], []);

  const setPart = (hour = parts.hour, minute = parts.minute, period = parts.period) => {
    onChange(mergeTime(hour, minute, period));
    setOpenField(null);
  };

  const fieldId = (field: PartField) => `${label}-${field}`;
  const toggleField = (field: PartField) => {
    const id = fieldId(field);
    setOpenField(openField === id ? null : id);
  };

  return (
    <fieldset className="custom-time-column">
      <legend>{label}</legend>
      <div className="time-column-controls">
        <CustomSelect
          ariaLabel={`${label} hour`}
          value={parts.hour}
          options={hours}
          isOpen={openField === fieldId('hour')}
          onToggle={() => toggleField('hour')}
          onSelect={next => setPart(next, parts.minute, parts.period)}
        />
        <CustomSelect
          ariaLabel={`${label} minute`}
          value={minutes.includes(parts.minute) ? parts.minute : '00'}
          options={minutes}
          isOpen={openField === fieldId('minute')}
          onToggle={() => toggleField('minute')}
          onSelect={next => setPart(parts.hour, next, parts.period)}
        />
        <CustomSelect
          ariaLabel={`${label} AM or PM`}
          value={parts.period}
          options={periods}
          isOpen={openField === fieldId('period')}
          onToggle={() => toggleField('period')}
          onSelect={next => setPart(parts.hour, parts.minute, next)}
        />
      </div>
    </fieldset>
  );
}

export function TimePicker(props: TimePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openField, setOpenField] = useState<string | null>(null);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>('.custom-time-trigger')?.focus();
  }, []);

  return (
    <div
      ref={rootRef}
      className="task-time-picker"
      role="dialog"
      aria-label="Task time range"
      onClick={() => setOpenField(null)}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (openField) setOpenField(null);
          else props.onCancel();
        }
      }}
    >
      <div className="task-time-fields">
        <TimeColumn
          label="Start"
          value={props.startTime}
          openField={openField}
          setOpenField={setOpenField}
          onChange={props.onStartChange}
        />
        <TimeColumn
          label="End"
          value={props.endTime}
          openField={openField}
          setOpenField={setOpenField}
          onChange={props.onEndChange}
        />
      </div>
      <div className="task-time-actions">
        <button type="button" onClick={props.onCancel}>Cancel</button>
        <button type="button" onClick={props.onConfirm}>Confirm</button>
      </div>
    </div>
  );
}