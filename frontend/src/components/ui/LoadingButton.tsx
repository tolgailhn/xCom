"use client";

interface LoadingButtonProps {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
}

export default function LoadingButton({
  onClick,
  loading,
  disabled = false,
  loadingText,
  children,
  className = "",
  variant = "primary",
}: LoadingButtonProps) {
  const baseClasses = "px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed";

  const variantClasses =
    variant === "primary"
      ? "bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-blue)] text-white hover:brightness-110"
      : variant === "danger"
        ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
        : "glass-card hover:bg-[var(--bg-tertiary)]";

  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`${baseClasses} ${variantClasses} ${className}`}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {loadingText || children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
