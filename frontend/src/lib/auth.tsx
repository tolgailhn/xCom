"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const API_BASE = "";

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  token: null,
  login: async () => false,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("xcom_token");
    const expiry = localStorage.getItem("xcom_token_expiry");
    if (saved && expiry && Date.now() / 1000 < Number(expiry)) {
      setToken(saved);
    } else {
      localStorage.removeItem("xcom_token");
      localStorage.removeItem("xcom_token_expiry");
    }
  }, []);

  const login = async (password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setToken(data.token);
      localStorage.setItem("xcom_token", data.token);
      localStorage.setItem("xcom_token_expiry", String(data.expires_at));
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem("xcom_token");
    localStorage.removeItem("xcom_token_expiry");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!token, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
