import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getLessonBookingSupabaseClient,
  getLessonBookingSupabaseStatus,
} from '@/lib/lessonBookingSupabase';

const LessonBookingAuthContext = createContext(null);

function currentLessonBookingReturnUrl() {
  const path = `${window.location.pathname}${window.location.search}`;
  const safePath = path.startsWith('/') && !path.startsWith('//') ? path : '/book-lessons';
  return `${window.location.origin}${safePath}`;
}

export function LessonBookingAuthProvider({ children }) {
  const client = useMemo(() => getLessonBookingSupabaseClient(), []);
  const configStatus = useMemo(() => getLessonBookingSupabaseStatus(), []);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(client));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!client) {
      setIsLoading(false);
      return undefined;
    }

    let active = true;

    client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError);
      setSession(data?.session ?? null);
      setIsLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession ?? null);
      setError(null);
      setIsLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const sendMagicLink = async (email) => {
    if (!client) throw new Error('Lesson booking Supabase is not configured.');
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (!normalizedEmail) throw new Error('Email is required.');

    const { error: signInError } = await client.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: currentLessonBookingReturnUrl() },
    });
    if (signInError) throw signInError;
  };

  const signOut = async () => {
    if (!client) return;
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) throw signOutError;
  };

  const value = {
    client,
    configStatus,
    session,
    user: session?.user ?? null,
    isAuthenticated: Boolean(session),
    isLoading,
    error,
    sendMagicLink,
    signOut,
  };

  return (
    <LessonBookingAuthContext.Provider value={value}>
      {children}
    </LessonBookingAuthContext.Provider>
  );
}

export function useLessonBookingAuth() {
  const context = useContext(LessonBookingAuthContext);
  if (!context) {
    throw new Error('useLessonBookingAuth must be used inside LessonBookingAuthProvider.');
  }
  return context;
}
