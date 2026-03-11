"use client";

interface SelectOption {
  id: string;
  name: string;
}

interface SelectInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export default function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder,
  className = "",
}: SelectInputProps) {
  return (
    <div className={className}>
      <label className="text-xs text-[var(--text-secondary)] block mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}
