#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260920080500_lesson_booking_phase2a_attendance_evidence.sql', import.meta.url),
  'utf8',
);
const daily = readFileSync(
  new URL('../supabase/functions/_shared/daily.ts', import.meta.url),
  'utf8',
);
const createVideoToken = readFileSync(
  new URL('../supabase/functions/create-video-token/index.ts', import.meta.url),
  'utf8',
);
const dailyWebhook = readFileSync(
  new URL('../supabase/functions/daily-webhook/index.ts', import.meta.url),
  'utf8',
);
const checkIn = readFileSync(
  new URL('../supabase/functions/check-in/index.ts', import.meta.url),
  'utf8',
);
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const required of [
  'bookings_video_room_matches_booking',
  'public.record_daily_attendance_event',
  'public.record_server_check_in',
  "b.status <> 'hold_placed'",
  "p_kind not in ('joined', 'left')",
  "p_source not in ('app_button', 'qr_scan')",
  "p_source = 'qr_scan' and v_actor <> 'student'",
  "b.starts_at - interval '30 minutes'",
  'p_occurred_at > b.ends_at',
  'v_now timestamptz := clock_timestamp()',
  "source, external_id",
  'attendance_replay_conflict',
]) {
  expect(migration.includes(required), `Phase 2A migration missing invariant: ${required}`);
}

for (const signature of [
  'public.record_daily_attendance_event(uuid, uuid, text, text, timestamptz, jsonb)',
  'public.record_server_check_in(uuid, uuid, text, inet, text)',
]) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  expect(
    new RegExp(`revoke all on function ${escaped}[\\s\\S]*?from public, anon, authenticated;[\\s\\S]*?grant execute[\\s\\S]*?to service_role;`, 'i').test(migration),
    `${signature} must remain service-role-only`,
  );
}

for (const required of [
  "const DAILY_API = 'https://api.daily.co/v1'",
  "Deno.env.get('DAILY_API_KEY')",
  "privacy !== 'private'",
  "privacy: 'private'",
  "eject_at_room_exp: true",
  "'/meeting-tokens'",
  'room_name: bookingId',
  'user_id: userId',
  'is_owner: isOwner',
  'nbf: starts - 15 * 60',
  'exp: ends',
  'eject_at_token_exp: true',
]) {
  expect(daily.includes(required), `Daily helper missing invariant: ${required}`);
}
expect(!/DAILY_API_KEY\s*=\s*['"][^'"]+/.test(daily), 'Daily helper must not contain a literal API key');

for (const required of [
  "withSupabase({ auth: 'user' }",
  ".eq('id', bookingId)",
  "booking.student_id !== userId && booking.tutor_id !== userId",
  "booking.status !== 'hold_placed'",
  "booking.video_room_name !== booking.id",
  'now < startsMs - OPEN_EARLY_MS || now > endsMs',
  'ensurePrivateDailyRoom(booking.id',
  'createDailyMeetingToken({',
  'userId,',
  'isOwner: booking.tutor_id === userId',
]) {
  expect(createVideoToken.includes(required), `create-video-token missing invariant: ${required}`);
}

for (const required of [
  "withSupabase({ auth: 'none' }",
  "const rawBody = await req.text()",
  "req.headers.get('x-webhook-timestamp')",
  "req.headers.get('x-webhook-signature')",
  "Math.abs(Date.now() - sentAt) > SIGNATURE_TOLERANCE_MS",
  "crypto.subtle.verify(",
  "new TextEncoder().encode(`${timestamp}.${rawBody}`)",
  "event.type !== 'participant.joined' && event.type !== 'participant.left'",
  'const eventId = String(event.id',
  'const bookingId = String(payload?.room',
  'const userId = String(payload?.user_id',
  'const sessionId = String(payload?.session_id',
  "event.type === 'participant.joined' ? 'joined' : 'left'",
  "'record_daily_attendance_event'",
  'p_external_id: eventId',
  'p_raw: event',
]) {
  expect(dailyWebhook.includes(required), `daily-webhook missing invariant: ${required}`);
}
expect(
  dailyWebhook.indexOf('await signatureOk(req, rawBody)') < dailyWebhook.indexOf('JSON.parse(rawBody)'),
  'Daily webhook must verify the raw body before JSON parsing',
);
expect(
  dailyWebhook.includes("return new Date((joinedAt + duration) * 1000)"),
  'Daily participant.left time must be derived from provider joined_at + duration',
);

for (const required of [
  "withSupabase({ auth: 'user' }",
  "const QR_WINDOW_MS = 30_000",
  "Deno.env.get('QR_SECRET')",
  "qrMessage(bookingId, window)",
  "window !== nowWindow && window !== nowWindow - 1",
  "booking.status !== 'hold_placed'",
  "booking.tutor_id !== userId",
  "booking.student_id !== userId",
  "source = 'qr_scan'",
  "'record_server_check_in'",
  'p_user_id: userId',
]) {
  expect(checkIn.includes(required), `check-in missing invariant: ${required}`);
}
expect(!checkIn.includes('body.occurred_at'), 'Browser check-in must never accept a client-authored attendance timestamp');
expect(!checkIn.includes('p_occurred_at'), 'Server check-in RPC call must never pass a client-authored timestamp');

for (const source of [daily, createVideoToken, dailyWebhook, checkIn]) {
  expect(!/paymentIntents\.capture\s*\(/.test(source), 'Phase 2A must not capture funds');
  expect(!/sk_(?:live|test)_[A-Za-z0-9]{12,}/.test(source), 'Phase 2A code must not contain literal Stripe secrets');
}

for (const required of [
  '[functions.create-video-token]',
  '[functions.check-in]',
  '[functions.daily-webhook]',
]) {
  expect(config.includes(required), `Supabase config missing ${required}`);
}
expect(
  /\[functions\.create-video-token\][\s\S]*?verify_jwt = true/i.test(config),
  'create-video-token must keep platform JWT verification enabled',
);
expect(
  /\[functions\.check-in\][\s\S]*?verify_jwt = true/i.test(config),
  'check-in must keep platform JWT verification enabled',
);
expect(
  /\[functions\.daily-webhook\][\s\S]*?verify_jwt = false/i.test(config),
  'daily-webhook must disable platform JWT verification so provider HMAC can authenticate it',
);

if (failures.length) {
  console.error('Lesson booking attendance boundary failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Lesson booking attendance boundary passed (private room/token access, signed/replay-safe Daily evidence, server-time fallback/QR, no capture).');
