import { createClient } from '@supabase/supabase-js';
import { APPROVED_SMART_PARROT_PREVIEW } from './lesson-booking-full-preview-supabase-transport.mjs';
import {
  buildPreviewFixturePrincipalPlan,
  cleanupPreviewFixturePrincipals,
  provisionPreviewFixturePrincipals,
} from './lesson-booking-full-preview-fixture-principals.mjs';

if (process.env.SMART_PARROT_PREVIEW_FIXTURE_WRITES_ENABLED !== '1') {
  console.log('Smart Parrot preview fixture principal writes disabled.');
  process.exit(0);
}

const runId = String(process.env.SMART_PARROT_FULL_PREVIEW_RUN_ID || '').trim();
const secretKey = String(process.env.SMART_PARROT_PREVIEW_SUPABASE_SECRET_KEY || '').trim();
const action = String(process.env.SMART_PARROT_PREVIEW_FIXTURE_ACTION || 'provision').trim().toLowerCase();
const ttlMinutes = Number(process.env.SMART_PARROT_PREVIEW_FIXTURE_TTL_MINUTES || 90);

const plan = buildPreviewFixturePrincipalPlan({
  runId,
  previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  ttlMinutes,
});

if (!secretKey.startsWith('sb_secret_')) {
  throw new Error('SMART_PARROT_PREVIEW_SUPABASE_SECRET_KEY must be an sb_secret_ key for the approved preview project.');
}
if (!['provision', 'cleanup'].includes(action)) throw new Error('SMART_PARROT_PREVIEW_FIXTURE_ACTION must be provision or cleanup.');

const supabaseAdmin = createClient(APPROVED_SMART_PARROT_PREVIEW.supabaseUrl, secretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const authAdmin = {
  getUserById: (id) => supabaseAdmin.auth.admin.getUserById(id),
  createUser: (input) => supabaseAdmin.auth.admin.createUser(input),
  deleteUser: (id) => supabaseAdmin.auth.admin.deleteUser(id),
};

const profileStore = {
  async setRole(userId, role) {
    const { error } = await supabaseAdmin.from('profiles').update({ role }).eq('id', userId);
    return { error };
  },
  async getRole(userId) {
    const { data, error } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle();
    return { role: data?.role ?? null, error };
  },
};

async function count(table, column, value) {
  const { count: rowCount, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value);
  if (error) throw error;
  return Number(rowCount || 0);
}

async function linkageProbe(userId) {
  const [bookingCount, consentCount, stripeLinkCount] = await Promise.all([
    count('bookings', 'student_id', userId),
    count('consents', 'user_id', userId),
    count('stripe_links', 'user_id', userId),
  ]);
  return {
    booking_count: bookingCount,
    consent_count: consentCount,
    stripe_link_count: stripeLinkCount,
  };
}

const result = action === 'provision'
  ? await provisionPreviewFixturePrincipals({
    plan,
    writeGate: process.env.SMART_PARROT_PREVIEW_FIXTURE_WRITES_ENABLED,
    secretKey,
    authAdmin,
    profileStore,
  })
  : await cleanupPreviewFixturePrincipals({ plan, authAdmin, linkageProbe });

console.log(JSON.stringify(result, null, 2));
