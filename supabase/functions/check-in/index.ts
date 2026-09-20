import { withSupabase } from 'npm:@supabase/server@^1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QR_WINDOW_MS = 30_000;
const EVIDENCE_LEAD_MS = 30 * 60 * 1000;

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status });
}

function qrSecret() {
  const secret = Deno.env.get('QR_SECRET')?.trim();
  if (!secret || secret.length < 32) throw new Error('qr_secret_required');
  return secret;
}

async function qrKey() {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(qrSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function encodeBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = atob(padded);
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function qrMessage(bookingId: string, window: number) {
  return `smart-parrot-check-in:${bookingId}:${window}`;
}

async function issueQrToken(bookingId: string) {
  const window = Math.floor(Date.now() / QR_WINDOW_MS);
  const signature = await crypto.subtle.sign(
    'HMAC',
    await qrKey(),
    new TextEncoder().encode(qrMessage(bookingId, window)),
  );
  return `${window}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifyQrToken(bookingId: string, token: string) {
  const [windowRaw, signatureRaw, extra] = token.split('.');
  if (!windowRaw || !signatureRaw || extra) return false;

  const window = Number(windowRaw);
  const nowWindow = Math.floor(Date.now() / QR_WINDOW_MS);
  if (!Number.isInteger(window) || (window !== nowWindow && window !== nowWindow - 1)) return false;

  const signature = decodeBase64Url(signatureRaw);
  if (!signature || signature.byteLength !== 32) return false;

  return crypto.subtle.verify(
    'HMAC',
    await qrKey(),
    signature,
    new TextEncoder().encode(qrMessage(bookingId, window)),
  );
}

function firstForwardedIp(req: Request) {
  const candidate = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  return candidate && candidate.length <= 64 ? candidate : null;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('invalid_json', 400);
    }

    const bookingId = String(body.booking_id ?? '').trim();
    const action = String(body.action ?? 'check_in').trim();
    const userId = ctx.userClaims?.id;

    if (!UUID_RE.test(bookingId)) return errorResponse('invalid_booking_id', 422);
    if (!userId || !UUID_RE.test(userId)) return errorResponse('authenticated_user_required', 401);
    if (!['qr_code', 'check_in'].includes(action)) return errorResponse('invalid_action', 422);

    const { data: booking, error } = await ctx.supabaseAdmin
      .from('bookings')
      .select('id, student_id, tutor_id, starts_at, ends_at, status')
      .eq('id', bookingId)
      .single();

    if (error || !booking || (booking.student_id !== userId && booking.tutor_id !== userId)) {
      return errorResponse('booking_not_found', 404);
    }
    if (booking.status !== 'hold_placed') return errorResponse('lesson_not_confirmed', 409);

    const startsMs = new Date(booking.starts_at).getTime();
    const endsMs = new Date(booking.ends_at).getTime();
    const now = Date.now();
    if (now < startsMs - EVIDENCE_LEAD_MS || now > endsMs) {
      return errorResponse('check_in_not_open', 409);
    }

    if (action === 'qr_code') {
      if (booking.tutor_id !== userId) return errorResponse('tutor_only', 403);
      try {
        return Response.json({
          booking_id: booking.id,
          qr_token: await issueQrToken(booking.id),
          expires_in_seconds: 30,
        });
      } catch {
        return errorResponse('qr_temporarily_unavailable', 503);
      }
    }

    const qrToken = typeof body.qr_token === 'string' ? body.qr_token.trim() : '';
    let source = 'app_button';
    if (qrToken) {
      if (booking.student_id !== userId) return errorResponse('qr_student_only', 403);
      let valid = false;
      try {
        valid = await verifyQrToken(booking.id, qrToken);
      } catch {
        return errorResponse('qr_temporarily_unavailable', 503);
      }
      if (!valid) return errorResponse('qr_expired', 422);
      source = 'qr_scan';
    }

    const { data: attendance, error: attendanceError } = await ctx.supabaseAdmin.rpc(
      'record_server_check_in',
      {
        p_booking_id: booking.id,
        p_user_id: userId,
        p_source: source,
        p_ip: firstForwardedIp(req),
        p_user_agent: req.headers.get('user-agent')?.slice(0, 1000) ?? null,
      },
    );

    if (attendanceError) {
      if (attendanceError.message.includes('attendance_outside_evidence_window')) {
        return errorResponse('check_in_not_open', 409);
      }
      if (attendanceError.message.includes('lesson_not_confirmed')) {
        return errorResponse('lesson_not_confirmed', 409);
      }
      return errorResponse('check_in_failed', 500);
    }

    return Response.json({ ok: true, attendance });
  }),
};
