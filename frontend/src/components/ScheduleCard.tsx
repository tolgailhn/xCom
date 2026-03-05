"use client";

interface Slot {
  time: string;
  icon: string;
  posted: boolean;
}

interface ScheduleCardProps {
  slots: Slot[];
  nextSlot: string | null;
  todayPosts: number;
}

const slotEmoji: Record<string, string> = {
  sunrise: "☀️",
  lunch: "🍽️",
  afternoon: "🚶",
  night: "🌙",
};

export default function ScheduleCard({
  slots,
  nextSlot,
  todayPosts,
}: ScheduleCardProps) {
  return (
    <div
      className="glass-card"
      style={{
        borderLeft: "3px solid transparent",
        borderImage: "linear-gradient(180deg, #6366f1, #22d3ee) 1",
      }}
    >
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xl">📅</span>
          <div>
            <strong className="text-[var(--text-primary)]">Gunluk Plan</strong>
            <span className="text-[var(--text-secondary)] ml-3 text-sm">
              {todayPosts}/4 post
            </span>
          </div>
        </div>
        {nextSlot && (
          <span className="text-sm text-[var(--accent-blue)] font-semibold">
            Sonraki: {nextSlot}
          </span>
        )}
      </div>

      <div className="flex gap-4 mt-3">
        {slots.map((slot) => (
          <div key={slot.time} className="flex items-center gap-1.5">
            <span>{slotEmoji[slot.icon] || "⏰"}</span>
            <span
              className={`slot-dot ${slot.posted ? "posted" : "pending"}`}
            />
            <span className="text-xs text-[var(--text-secondary)]">
              {slot.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
