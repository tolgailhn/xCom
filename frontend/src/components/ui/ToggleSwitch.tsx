"use client";

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (value: boolean) => void;
  activeColor?: string;
  className?: string;
}

export default function ToggleSwitch({
  enabled,
  onChange,
  activeColor = "bg-green-500",
  className = "",
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative w-14 h-7 rounded-full transition-colors ${
        enabled ? activeColor : "bg-gray-600"
      } ${className}`}
    >
      <span
        className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
          enabled ? "left-8" : "left-1"
        }`}
      />
    </button>
  );
}
