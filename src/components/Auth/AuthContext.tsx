import { createContext } from "react";

export type User = { id: string};

export interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (request: { email: string; password: string; firstName: string; lastName: string;}) => Promise<void>;
  accessToken: string | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);