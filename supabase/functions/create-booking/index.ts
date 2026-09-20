import { withSupabase } from 'npm:@supabase/server@^1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: string, status: number, detail?: string) {
  return Response.json({ error, ...(detail ? { detail } : {}) }, { status });
}

function firstForwardedIp(req: Request) {
  const candidate = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!candidate || candidate.length > 64) return null;
  return candidate;
}

function mapReservationError(message: string) {
  switch (message) {
    case 'slot_taken':
    case 'slot_unavailable':
      return { status: 409, error: 'slot_unavailable' };
    case 'express_start_request_required':
      return { status: 422, error: message };
    case 'lesson_type_not_found':
      return { status: 404, error: message };
    case 'booking_policy_not_configured':
    case 'invalid_booking_policy_config':
      return { status: 503, error: 'booking_temporarily_unavailable' };
    case 'idempotency_key_reused':
    case 'invalid_booking_request':
      return { status: 422, error: message };
    default:
      return { status: 500, error: 'booking_reservation_failed' };
  }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return errorResponse('method_not_allowed', 405);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('invalid_json', 400);
    }

    const lessonTypeId = String(body.lesson_type_id ?? '').trim();
    const requestId = String(body.request_id ?? '').trim();
    const startsAtRaw = String(body.starts_at ?? '').trim();
    const expressStartRequest = body.express_start_request === true;

    if (!UUID_RE.test(lessonTypeId)) {
      return errorResponse('invalid_lesson_type_id', 422);
    }
    if (!UUID_RE.test(requestId)) {
      return errorResponse('invalid_request_id', 422);
    }

    const startsAt = new Date(startsAtRaw);
    if (!startsAtRaw || Number.isNaN(startsAt.getTime())) {
      return errorResponse('invalid_starts_at', 422);
    }

    const studentId = ctx.userClaims?.id;
    if (!studentId || !UUID_RE.test(studentId)) {
      return errorResponse('authenticated_user_required', 401);
    }

    const { data, error } = await ctx.supabaseAdmin.rpc('create_booking_reservation', {
      p_student_id: studentId,
      p_lesson_type_id: lessonTypeId,
      p_starts_at: startsAt.toISOString(),
      p_request_id: requestId,
      p_express_start_request: expressStartRequest,
      p_ip: firstForwardedIp(req),
      p_user_agent: req.headers.get('user-agent')?.slice(0, 1000) ?? null,
    });

    if (error) {
      const mapped = mapReservationError(error.message);
      return errorResponse(mapped.error, mapped.status);
    }

    if (!data || typeof data !== 'object') {
      return errorResponse('booking_reservation_failed', 500);
    }

    return Response.json(
      { booking: data },
      { status: data.created === true ? 201 : 200 },
    );
  }),
};
