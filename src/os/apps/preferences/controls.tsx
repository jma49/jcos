import type { ReactNode } from 'react';

// Building blocks the panes share, so they line up the same way.

/** A checkbox or radio button with a title and a line under it. */
export function Option({
  type = 'checkbox',
  name,
  checked,
  onChange,
  title,
  children,
  disabled
}: {
  type?: 'checkbox' | 'radio';
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label data-disabled={disabled || undefined}>
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>{title}</strong>
        {children && <small>{children}</small>}
      </span>
    </label>
  );
}

/** A titled group of settings, set in a recessed box as Leopard's panes are. */
export function Group({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`os-prefs-section${className ? ` ${className}` : ''}`}>
      {title && <h3>{title}</h3>}
      <div className="os-prefs-box">{children}</div>
    </section>
  );
}

/** A row of choices shown as a segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  choices,
  onChange
}: {
  label: string;
  value: T;
  choices: { value: T; name: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="os-segmented" role="group" aria-label={label}>
      {choices.map((c) => (
        <button key={c.value} type="button" aria-pressed={value === c.value} onClick={() => onChange(c.value)}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
