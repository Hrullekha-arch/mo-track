
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User, UserRole } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User as FirebaseUser } from "firebase/auth";
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  role: UserRole | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- SIMULATED LOGIN ---
// This is a "fake" user for the local login simulation.
const MOCK_USER: User = {
    id: "admin-user-id",
    name: "Admin User",
    email: "admin@motrack.com",
    role: "admin",
    designation: undefined,
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    // This is a simulated login to avoid external API calls.
    // It allows access to the dashboard without needing Firebase Auth to be configured.
    if (email === 'admin@motrack.com' && password === 'password') {
        setUser(MOCK_USER);
        toast({ title: "Login Successful", description: "This is a simulated login." });
        
        sessionStorage.removeItem('hasSeenWelcome');
        if (MOCK_USER.role === 'installer') {
            router.push('/mobile');
        } else {
            router.push('/dashboard');
        }
        setLoading(false);
        return true;
    } else {
        toast({ variant: "destructive", title: "Login Failed", description: "Use the credentials mentioned on the login page." });
        setLoading(false);
        return false;
    }
  };

  const logout = async () => {
    setLoading(true);
    setUser(null);
    setFirebaseUser(null);
    sessionStorage.removeItem('hasSeenWelcome');
    router.push('/');
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, role: user?.role || null, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
