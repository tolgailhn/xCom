"use client";

import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", label: "Ana Sayfa", shortLabel: "Ana Sayfa", icon: "home" },
  { href: "/yaz", label: "Tweet Yaz", shortLabel: "Yaz", icon: "edit" },
  { href: "/icerik", label: "Icerik Uret", shortLabel: "Icerik", icon: "lightbulb" },
  { href: "/analiz", label: "Tweet Analizi", shortLabel: "Analiz", icon: "bar_chart" },
  { href: "/taslaklarim", label: "Taslaklarim", shortLabel: "Taslak", icon: "draft" },
  { href: "/takvim", label: "Takvim", shortLabel: "Takvim", icon: "calendar_today" },
  { href: "/strateji", label: "Strateji Rehberi", shortLabel: "Strateji", icon: "strategy" },
  { href: "/otomatik-yanit", label: "Otomatik Yanit", shortLabel: "Yanit", icon: "auto_reply" },
  { href: "/ayarlar", label: "Ayarlar", shortLabel: "Ayarlar", icon: "settings" },
];

const iconMap: Record<string, string> = {
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  edit: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  lightbulb: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  bar_chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  calendar_today: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  draft: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  strategy: "M13 10V3L4 14h7v7l9-11h-7z",
  auto_reply: "M3 10h10a1 1 0 011 1v2a1 1 0 01-1 1H3l-2 2V11a1 1 0 011-1z M8 6h10a1 1 0 011 1v6l-2-2h-8a1 1 0 01-1-1V7a1 1 0 011-1z",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

function NavIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  return (
    <svg
      className="flex-shrink-0"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={iconMap[icon]}
      />
    </svg>
  );
}

export default function Sidebar() {
  const [pathname, setPathname] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const { logout } = useAuth();

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  // Close "more" menu when clicking outside
  useEffect(() => {
    if (!moreOpen) return;
    const handler = () => setMoreOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [moreOpen]);

  // Mobile: show 4 primary tabs + "more" menu for the rest
  const primaryTabs = navItems.slice(0, 4);
  const secondaryTabs = navItems.slice(4);

  return (
    <>
      {/* ===== MOBILE: Top header (minimal) ===== */}
      <div className="mobile-header md:hidden">
        <span className="text-lg font-bold gradient-text">X AI</span>
        <button
          onClick={logout}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-red)] transition-colors"
        >
          Cikis
        </button>
      </div>

      {/* ===== MOBILE: Bottom tab bar ===== */}
      <nav className="mobile-bottom-nav md:hidden">
        {primaryTabs.map((item) => {
          const isActive = pathname === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`mobile-tab-item ${isActive ? "active" : ""}`}
            >
              <NavIcon icon={item.icon} size={22} />
              <span>{item.shortLabel}</span>
            </a>
          );
        })}

        {/* More button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMoreOpen(!moreOpen);
          }}
          className={`mobile-tab-item ${secondaryTabs.some((t) => t.href === pathname) ? "active" : ""}`}
        >
          <svg width={22} height={22} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
          </svg>
          <span>Daha</span>
        </button>

        {/* More menu popover */}
        {moreOpen && (
          <div className="mobile-more-menu" onClick={(e) => e.stopPropagation()}>
            {secondaryTabs.map((item) => {
              const isActive = pathname === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`mobile-more-item ${isActive ? "active" : ""}`}
                >
                  <NavIcon icon={item.icon} size={20} />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>
        )}
      </nav>

      {/* ===== DESKTOP: Sidebar (unchanged) ===== */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-[var(--bg-secondary)] border-r border-[var(--border)] z-40">
        {/* Logo */}
        <div className="p-6 border-b border-[var(--border)]">
          <h1 className="text-2xl font-bold gradient-text">X AI Otomasyon</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Yaz &middot; Uret &middot; Paylas
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive ? "active" : ""}`}
              >
                <NavIcon icon={item.icon} />
                <span className="text-sm font-medium">{item.label}</span>
              </a>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] space-y-2">
          <button
            onClick={logout}
            className="w-full text-left text-xs text-[var(--text-secondary)] hover:text-[var(--accent-red)] transition-colors px-2 py-1"
          >
            Cikis Yap
          </button>
          <p className="text-xs text-[var(--text-secondary)] px-2">v2.0 - Next.js</p>
        </div>
      </aside>
    </>
  );
}
