import { withSupabase } from 'npm:@supabase/server@^1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

function webhookSecretBytes() {
  const secret = Deno.env.get('DAILY_WEBHOOK_SECRET')?.trim() ?? '';
  if (!secret || secret.length < 24 || secret.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(secret)) {
    throw new Error('daily_webhook_secret_required');
  }

  try {
    const decoded = atob(secret);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    if (bytes.byteLength < 16) throw new Error('daily_webhook_secret_required');
    return bytes;
  } catch {
    throw new Error('daily_webhook_secret_required');
  }
}

function signatureBytes(value: string) {
  const normalized = value.trim().replace(/^(?:sha256=|v1=)/i, '');
  if (/^[0-9a-f]{64}$/i.test(normalized)) {
    return Uint8Array.from(normalized.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)));
  }

  try {
    const base64 = normalized.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = atob(padded);
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function timestampMillis(value: string) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function signatureOk(req: Request, rawBody: string) {
  const timestamp = req.headers.get('x-webhook-timestamp')?.trim() ?? '';
  const signature = req.headers.get('x-webhook-signature')?.trim() ?? '';
  if (!timestamp || !signature) return false;

  const sentAt = timestampMillis(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > SIGNATURE_TOLERANCE_MS) {
    return false;
  }

  const provided = signatureBytes(signature);
  if (!provided || provided.byteLength !== 32) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    webhookSecretBytes(),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  return crypto.subtle.verify(
    'HMAC',
    key,
    provided,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
}

function occurredAtFor(event: Record<string, any>) {
  const payload = event.payload as Record<string, unknown> | undefined;
  const joinedAt = Number(payload?.joined_at);
  if (!Number.isFinite(joinedAt) || joinedAt <= 0) return null;

  if (event.type === 'participant.joined') return new Date(joinedAt * 1000);

  const duration = Number(payload?.duration);
  if (!Number.isFinite(duration) || duration < 0) return null;
  return new Date((joinedAt + duration) * 1000);
}

function ignorableAttendanceError(message: string) {
  return [
    'booking_not_found',
    'lesson_not_confirmed',
    'participant_not_in_booking',
    'attendance_outside_evidence_window',
  ].some((known) => message.includes(known));
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

    const rawBody = await req.text();
    let verified = false;
    try {
      verified = await signatureOk(req, rawBody);
    } catch {
      return new Response('webhook verification unavailable', { status: 503 });
    }
    if (!verified) return new Response('bad signature', { status: 401 });

    let event: Record<string, any>;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response('invalid json', { status: 400 });
    }

    // Daily signs this endpoint-verification request just like a real delivery.
    // Keep the response path fast: signature verification happens before this branch,
    // then we return 200 without a database or provider network round-trip.
    if (event.test === 'test' && Object.keys(event).length === 1) {
      return Response.json({ received: true, verified: true });
    }

    if (event.type !== 'participant.joined' && event.type !== 'participant.left') {
      return Response.json({ received: true, ignored: 'event_type' });
    }

    const payload = event.payload as Record<string, unknown> | undefined;
    const eventId = String(event.id ?? '').trim();
    const bookingId = String(payload?.room ?? '').trim();
    const userId = String(payload?.user_id ?? '').trim();
    const sessionId = String(payload?.session_id ?? '').trim();
    const occurredAt = occurredAtFor(event);

    if (
      !eventId || eventId.length > 255 ||
      !UUID_RE.test(bookingId) ||
      !UUID_RE.test(userId) ||
      !sessionId || sessionId.length > 255 ||
      !occurredAt || Number.isNaN(occurredAt.getTime())
    ) {
      return Response.json({ error: 'invalid_daily_event' }, { status: 400 });
    }

    const { data, error } = await ctx.supabaseAdmin.rpc('record_daily_attendance_event', {
      p_booking_id: bookingId,
      p_user_id: userId,
      p_kind: event.type === 'participant.joined' ? 'joined' : 'left',
      p_external_id: eventId,
      p_occurred_at: occurredAt.toISOString(),
      p_raw: event,
    });

    if (error) {
      if (ignorableAttendanceError(error.message)) {
        return Response.json({ received: true, ignored: 'not_admissible_evidence' });
      }
      if (error.message.includes('attendance_replay_conflict')) {
        return Response.json({ error: 'attendance_replay_conflict' }, { status: 409 });
      }
      return Response.json({ error: 'attendance_record_failed' }, { status: 500 });
    }

    return Response.json({ received: true, attendance: data });
  }),
};
