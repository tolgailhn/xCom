"use client";

import { getScoreColor } from "./helpers";

interface CircularGaugeProps {
  value: number;
  maxValue?: number;
  size?: number;
  strokeWidth?: number;
  colorFn?: (value: number) => string;
}

export default function CircularGauge({
  value,
  maxValue = 100,
  size = 40,
  strokeWidth = 3,
  colorFn = getScoreColor,
}: CircularGaugeProps) {
  const viewBox = 44;
  const cx = viewBox / 2;
  const radius = cx - strokeWidth - 1;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / maxValue, 1);
  const color = colorFn(value);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${viewBox} ${viewBox}`}>
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke="var(--border-primary)" strokeWidth={strokeWidth} opacity={0.2} />
      <circle
        cx={cx} cy={cx} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${pct * circumference} ${circumference}`}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`}
      />
      <text x={cx} y={cx + 4} textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">
        {Math.round(value)}
      </text>
    </svg>
  );
}
