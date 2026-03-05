"use client";

import Link from "next/link";

interface ActionCardProps {
  href: string;
  icon: string;
  title: string;
  description: string;
}

export default function ActionCard({
  href,
  icon,
  title,
  description,
}: ActionCardProps) {
  return (
    <Link href={href}>
      <div className="glass-card text-center cursor-pointer hover:border-[var(--accent-cyan)]">
        <div className="text-3xl mb-2">{icon}</div>
        <div className="font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="text-xs text-[var(--text-secondary)] mt-1">
          {description}
        </div>
      </div>
    </Link>
  );
}
