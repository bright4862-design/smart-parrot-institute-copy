import { withSupabase } from 'npm:@supabase/server@^1';
import { createDailyMeetingToken, ensurePrivateDailyRoom } from '../_shared/daily.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPEN_EARLY_MS = 15 * 60 * 1000;

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status });
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
    if (!UUID_RE.test(bookingId)) return errorResponse('invalid_booking_id', 422);

    const userId = ctx.userClaims?.id;
    if (!userId || !UUID_RE.test(userId)) return errorResponse('authenticated_user_required', 401);

    const { data: booking, error } = await ctx.supabaseAdmin
      .from('bookings')
      .select('id, student_id, tutor_id, starts_at, ends_at, status, video_room_name')
      .eq('id', bookingId)
      .single();

    if (error || !booking || (booking.student_id !== userId && booking.tutor_id !== userId)) {
      return errorResponse('booking_not_found', 404);
    }

    if (booking.status !== 'hold_placed') {
      return errorResponse('lesson_not_confirmed', 409);
    }

    if (booking.video_room_name && booking.video_room_name !== booking.id) {
      return errorResponse('lesson_room_integrity_failed', 503);
    }

    const startsMs = new Date(booking.starts_at).getTime();
    const endsMs = new Date(booking.ends_at).getTime();
    const now = Date.now();
    if (!Number.isFinite(startsMs) || !Number.isFinite(endsMs)) {
      return errorResponse('lesson_time_invalid', 500);
    }
    if (now < startsMs - OPEN_EARLY_MS || now > endsMs) {
      return errorResponse('lesson_not_open', 409);
    }

    try {
      const room = await ensurePrivateDailyRoom(booking.id, booking.starts_at, booking.ends_at);

      if (!booking.video_room_name) {
        const { error: roomStateError } = await ctx.supabaseAdmin
          .from('bookings')
          .update({ video_room_name: booking.id })
          .eq('id', booking.id)
          .eq('status', 'hold_placed')
          .is('video_room_name', null);

        if (roomStateError) throw new Error('lesson_room_state_failed');
      }

      const { data: profile } = await ctx.supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();

      const userName = String(profile?.full_name || ctx.userClaims?.email || 'Participant');
      const token = await createDailyMeetingToken({
        bookingId: booking.id,
        userId,
        userName,
        isOwner: booking.tutor_id === userId,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
      });

      return Response.json({
        booking_id: booking.id,
        room_url: room.url,
        token,
        opens_at: new Date(startsMs - OPEN_EARLY_MS).toISOString(),
        ends_at: new Date(endsMs).toISOString(),
      });
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'daily_test_configuration_required') {
        return errorResponse('video_temporarily_unavailable', 503);
      }
      if (message === 'daily_room_integrity_failed' || message === 'daily_room_url_missing') {
        return errorResponse('lesson_room_integrity_failed', 503);
      }
      return errorResponse('video_provider_failed', 502);
    }
  }),
};
