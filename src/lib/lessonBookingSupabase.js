import { createClient } from '@supabase/supabase-js';

const URL_ENV = 'VITE_SUPABASE_URL';
const KEY_ENV = 'VITE_SUPABASE_PUBLISHABLE_KEY';
const SMART_PARROT_SUPABASE_URL = 'https://mrzzbhqzxshtbqvxkcjn.supabase.co';
const SMART_PARROT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3IbLBnSyrWYjP5FTJAiZVQ_mSIVwQmt';

let cachedClient = null;
let cachedIdentity = null;

function readEnv(name) {
  return String(import.meta.env?.[name] ?? '').trim();
}

function isSafeProjectUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function getLessonBookingSupabaseStatus() {
  const url = readEnv(URL_ENV) || SMART_PARROT_SUPABASE_URL;
  const publishableKey = readEnv(KEY_ENV) || SMART_PARROT_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return {
      configured: false,
      reason: 'missing_booking_supabase_env',
    };
  }

  if (!isSafeProjectUrl(url)) {
    return {
      configured: false,
      reason: 'invalid_booking_supabase_url',
    };
  }

  if (!publishableKey.startsWith('sb_publishable_')) {
    return {
      configured: false,
      reason: 'publishable_key_required',
    };
  }

  return {
    configured: true,
    reason: null,
  };
}

export function getLessonBookingSupabaseClient() {
  const status = getLessonBookingSupabaseStatus();
  if (!status.configured) return null;

  const url = readEnv(URL_ENV) || SMART_PARROT_SUPABASE_URL;
  const publishableKey = readEnv(KEY_ENV) || SMART_PARROT_SUPABASE_PUBLISHABLE_KEY;
  const identity = `${url}\n${publishableKey}`;

  if (!cachedClient || cachedIdentity !== identity) {
    cachedClient = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      db: {
        schema: 'public',
      },
    });
    cachedIdentity = identity;
  }

  return cachedClient;
}
