"use client";

import { AuthProvider, useAuth } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  useEffect(() => {
    if (pathname && !isAuthenticated && pathname !== "/login") {
      window.location.href = "/login";
    }
  }, [isAuthenticated, pathname]);

  // Wait for pathname to be set
  if (!pathname) return null;

  // Login page — no sidebar, no guard
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Not authenticated — show nothing while redirecting
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated — show sidebar + content
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* pt-14: mobile header, pb-28: mobile bottom nav clearance, md:pb-8: desktop bottom spacing */}
      <main className="flex-1 pt-14 pb-28 px-3 md:pt-0 md:pb-8 md:px-8 md:ml-64 min-w-0">
        {children}
      </main>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>{children}</AuthGuard>
    </AuthProvider>
  );
}
