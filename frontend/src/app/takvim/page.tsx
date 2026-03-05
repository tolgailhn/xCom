"use client";

import { useEffect, useState } from "react";
import { getTodaySchedule } from "@/lib/api";

interface SlotData {
  time: string;
  label: string;
  posted: boolean;
  log?: {
    post_type: string;
    content: string;
    url: string;
  };
}

interface ScheduleData {
  date: string;
  is_weekend: boolean;
  slots: SlotData[];
}

export default function TakvimPage() {
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTodaySchedule()
      .then((d) => setSchedule(d as ScheduleData))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-secondary)]">Yukleniyor...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold gradient-text">Posting Takvimi</h2>
        {schedule && (
          <span className="text-sm text-[var(--text-secondary)]">
            {schedule.date} {schedule.is_weekend ? "(Hafta sonu)" : ""}
          </span>
        )}
      </div>

      {/* Slots */}
      {schedule && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {schedule.slots.map((slot) => (
            <div
              key={slot.time}
              className={`glass-card ${
                slot.posted
                  ? "border-[var(--accent-green)]/30"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span
                    className={`slot-dot ${
                      slot.posted ? "posted" : "pending"
                    }`}
                  />
                  <div>
                    <span className="font-semibold">{slot.time}</span>
                    <span className="text-sm text-[var(--text-secondary)] ml-2">
                      {slot.label}
                    </span>
                  </div>
                </div>
                {slot.posted ? (
                  <span className="text-xs text-[var(--accent-green)] font-semibold">
                    Paylasildi
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text-secondary)]">
                    Bekliyor
                  </span>
                )}
              </div>

              {slot.log && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                    {slot.log.content}
                  </p>
                  {slot.log.url && (
                    <a
                      href={slot.log.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--accent-blue)] hover:underline mt-1 inline-block"
                    >
                      Goruntule →
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
