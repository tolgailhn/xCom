"use client";

interface ErrorMessageProps {
  message: string | null;
  type?: "error" | "success" | "warning";
  className?: string;
}

export default function ErrorMessage({
  message,
  type = "error",
  className = "",
}: ErrorMessageProps) {
  if (!message) return null;

  const borderColor =
    type === "error"
      ? "border-[var(--accent-red)]/50"
      : type === "success"
        ? "border-[var(--accent-green)]/50"
        : "border-[var(--accent-yellow)]/50";

  const textColor =
    type === "error"
      ? "text-[var(--accent-red)]"
      : type === "success"
        ? "text-[var(--accent-green)]"
        : "text-[var(--accent-yellow)]";

  return (
    <div className={`glass-card ${borderColor} ${className}`}>
      <p className={`text-sm ${textColor}`}>{message}</p>
    </div>
  );
}
