import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  async function login(email: string, password: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) throw new Error("Invalid Credentials");

    const { user } = await res.json();
    return user;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }

  async function checkSession() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) setUser(await res.json());
    } catch {
      setUser(null);
    }
  }

  const value = {
    user,
    login: setUser,
    logout: () => setUser(null),
    checkSession: () => {},
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
