import { useState, useEffect } from "react";
import { type User, AuthContext } from "./AuthContext";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(
        localStorage.getItem("accessToken")
    );

    // Load user on page refresh if token exists
    useEffect(() => {
        (async () => {
            if (!accessToken) return setUser(null);

            try {
                const res = await fetch("/api/auth/refresh-token", {
                headers: { Authorization: `Bearer ${accessToken}` },
                });

                if (!res.ok) throw new Error("Not authenticated");

                const data = await res.json();
                setUser(data.user);
            } catch {
                setUser(null);
                setAccessToken(null);
                localStorage.removeItem("accessToken");
            }
        })();
    }, [accessToken]);

    // Login
    async function login(email: string, password: string) {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            await handleApiError(res, "Login failed");  
        }

        const data = await res.json();
        setUser(data.data.user);
        setAccessToken(data.data.accessToken);
        localStorage.setItem("accessToken", data.data.accessToken);
    }   

    // Logout
    async function logout() {
        if (accessToken) {
            await fetch("/api/auth/logout", {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` },
            });
        }
        setUser(null);
        setAccessToken(null);
        localStorage.removeItem("accessToken");
    }

    // Register
    async function register(request: {email: string; password: string; firstName: string; lastName: string;}) {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });

        if (!res.ok) {
            await handleApiError(res, "Registration failed");
        }
    }

    async function handleApiError(res: Response, defaultMessage: string): Promise<never> {
        let message = defaultMessage;

        try {
            const errData = await res.clone().json();
            message = errData.message || errData.error || JSON.stringify(errData);
        } catch {
        try {
            const text = await res.text();
            if (text) message = text;
        } catch {
            // leave default message
        }
        }

        throw new Error(message);
    }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        register,
        accessToken, // expose token for authenticated fetches
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
