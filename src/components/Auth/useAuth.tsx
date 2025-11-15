import { useContext } from "react"; 
import { AuthContext, type AuthContextType } from "./AuthContext";

export function useAuth(): AuthContextType {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be inside AuthProvider");
    return ctx;
}