
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User, UserRole } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User as FirebaseUser } from "firebase/auth";
import { useAuth as useFirebaseAuth } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

const getLoginFailureMessage = (error: unknown) => {
  const code =
    typeof (error as { code?: unknown })?.code === "string"
      ? (error as { code: string }).code
      : undefined;

  if (code === "auth/network-request-failed") {
    return "Could not reach Firebase Auth. Check your internet connection and refresh the page once.";
  }

  if (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password" ||
    code === "auth/invalid-email"
  ) {
    return "Invalid email or password. Please try again.";
  }

  return "Unable to sign in right now. Please try again.";
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();
  const auth = useFirebaseAuth();

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | undefined;
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
        unsubscribeUserDoc?.();
        unsubscribeUserDoc = undefined;
        if (fbUser) {
            setFirebaseUser(fbUser);
            const userDocRef = doc(db, "users", fbUser.uid);
            unsubscribeUserDoc = onSnapshot(
              userDocRef,
              (docSnap) => {
                setUser(docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as User) : null);
                setLoading(false);
              },
              () => {
                setUser(null);
                setLoading(false);
              }
            );
        } else {
            setUser(null);
            setFirebaseUser(null);
            setLoading(false);
        }
    });

    return () => {
      unsubscribe();
      unsubscribeUserDoc?.();
    };
  }, [auth]);


  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
        toast({ title: "Login Successful" });
        sessionStorage.removeItem('hasSeenWelcome');
        
        // The onAuthStateChanged listener will handle routing
        setLoading(false);
        return true;
    } catch (error) {
        toast({
            variant: "destructive",
            title: "Login Failed",
            description: getLoginFailureMessage(error),
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
