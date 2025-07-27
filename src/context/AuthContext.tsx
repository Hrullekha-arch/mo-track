
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser) {
            setFirebaseUser(fbUser);
            const userDocRef = doc(db, "users", fbUser.uid);
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                setUser({ id: docSnap.id, ...docSnap.data() } as User);
            } else {
                // Handle case where user exists in Auth but not Firestore
                setUser(null);
            }
        } else {
            setUser(null);
            setFirebaseUser(null);
        }
        setLoading(false);
    });

    return () => unsubscribe();
  }, []);


  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
        toast({ title: "Login Successful" });
        sessionStorage.removeItem('hasSeenWelcome');
        
        // The onAuthStateChanged listener will handle routing
        setLoading(false);
        return true;
    } catch (error: any) {
        console.error("Login Error:", error);
        toast({
            variant: "destructive",
            title: "Login Failed",
            description: "Invalid email or password. Please try again.",
        });
        setLoading(false);
        return false;
    }
  };

  const logout = async () => {
    setLoading(true);
    await signOut(auth);
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
