"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User, UserRole } from '@/lib/types';
import { mockUsers } from '@/lib/mock-data';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  login: (email: string) => boolean;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('motrack_user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Could not parse user from localStorage", error);
    }
    setLoading(false);
  }, []);

  const login = (email: string) => {
    const foundUser = mockUsers.find(u => u.email === email);
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('motrack_user', JSON.stringify(foundUser));
      if (foundUser.role === 'installer') {
        router.push('/mobile');
      } else {
        router.push('/dashboard');
      }
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('motrack_user');
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, role: user?.role || null, login, logout, loading }}>
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
