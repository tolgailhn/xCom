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
      {/* pt-14: mobile header height, pb-20: mobile bottom nav height */}
      <main className="flex-1 pt-14 pb-20 px-4 md:pt-0 md:pb-0 md:p-8 md:ml-64">
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
