"use client";

interface StatBoxProps {
  value: string;
  label: string;
  color?: string;
}

export default function StatBox({ value, label, color }: StatBoxProps) {
  return (
    <div className="glass-card text-center">
      <div
        className="stat-value"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
