const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date;
}

function assertUuid(value, label) {
  const normalized = String(value ?? '').trim();
  if (!UUID_RE.test(normalized)) throw new Error(`${label} must be a UUID.`);
  return normalized;
}

export async function listAvailableLessonSlots(client, { lessonTypeId, from, to }) {
  if (!client) throw new Error('Lesson booking Supabase client is unavailable.');
  if (!UUID_RE.test(String(lessonTypeId ?? ''))) {
    throw new Error('lessonTypeId must be a UUID.');
  }

  const fromDate = asDate(from, 'from');
  const toDate = asDate(to, 'to');

  if (toDate <= fromDate) throw new Error('to must be after from.');
  if (toDate.getTime() - fromDate.getTime() > 31 * 24 * 60 * 60 * 1000) {
    throw new Error('Slot searches are limited to 31 days.');
  }

  const { data, error } = await client.rpc('available_slots', {
    p_lesson_type_id: lessonTypeId,
    p_from: fromDate.toISOString(),
    p_to: toDate.toISOString(),
  });

  if (error) throw error;

  return (data ?? []).map((slot) => ({
    start: slot.slot_start,
    end: slot.slot_end,
  }));
}

export async function getPolicyVersion(client, policyVersionId) {
  if (!client) throw new Error('Lesson booking Supabase client is unavailable.');
  const id = String(policyVersionId ?? '').trim();
  if (!id || id.length > 160) throw new Error('policyVersionId is required.');

  const { data, error } = await client
    .from('policy_versions')
    .select('id, terms_markdown, terms_sha256, published_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Policy version not found.');
  return data;
}

export async function previewBookingActions(client, bookingId) {
  if (!client) throw new Error('Lesson booking Supabase client is unavailable.');
  const id = assertUuid(bookingId, 'bookingId');
  const { data, error } = await client.rpc('preview_booking_actions', {
    p_booking_id: id,
  });
  if (error) throw error;
  return data;
}

export async function getBookingComplianceStatus(client, bookingId) {
  if (!client) throw new Error('Lesson booking Supabase client is unavailable.');
  const id = assertUuid(bookingId, 'bookingId');
  const { data, error } = await client.rpc('booking_compliance_status', {
    p_booking_id: id,
  });
  if (error) throw error;
  return data;
}

export async function listMyLessons(client) {
  if (!client) throw new Error('Lesson booking Supabase client is unavailable.');

  const { data: bookings, error: bookingError } = await client
    .from('bookings')
    .select('id, tutor_id, lesson_type_id, policy_version_id, starts_at, ends_at, status, currency, final_amount_cents, outcome, cancelled_at, cancel_kind')
    .order('starts_at', { ascending: true });
  if (bookingError) throw bookingError;

  const rows = bookings ?? [];
  const lessonTypeIds = [...new Set(rows.map((row) => row.lesson_type_id).filter(Boolean))];
  const policyIds = [...new Set(rows.map((row) => row.policy_version_id).filter(Boolean))];

  const [lessonTypeResult, policyResult] = await Promise.all([
    lessonTypeIds.length
      ? client.from('lesson_types').select('id, name, duration_minutes').in('id', lessonTypeIds)
      : Promise.resolve({ data: [], error: null }),
    policyIds.length
      ? client.from('policy_versions').select('id, terms_sha256, published_at').in('id', policyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (lessonTypeResult.error) throw lessonTypeResult.error;
  if (policyResult.error) throw policyResult.error;

  const lessonTypesById = new Map((lessonTypeResult.data ?? []).map((row) => [row.id, row]));
  const policiesById = new Map((policyResult.data ?? []).map((row) => [row.id, row]));

  const enriched = await Promise.all(rows.map(async (booking) => {
    let actions = null;
    let compliance = null;
    let actionError = null;
    try {
      actions = await previewBookingActions(client, booking.id);
    } catch (error) {
      actionError = error;
    }

    if (booking.status === 'cancelled') {
      try {
        compliance = await getBookingComplianceStatus(client, booking.id);
      } catch {
        compliance = null;
      }
    }

    return {
      ...booking,
      lessonType: lessonTypesById.get(booking.lesson_type_id) ?? null,
      policy: policiesById.get(booking.policy_version_id) ?? null,
      actions,
      compliance,
      actionError,
    };
  }));

  return enriched;
}

export async function requestBookingCancellation(
  client,
  { bookingId, kind = 'cancel', declarationName = '', receiptEmail = '' },
) {
  if (!client) throw new Error('Lesson booking Supabase client is unavailable.');
  const id = assertUuid(bookingId, 'bookingId');
  if (!['cancel', 'withdrawal'].includes(kind)) throw new Error('Unsupported cancellation kind.');

  const requestBody = { booking_id: id, kind };
  if (kind === 'withdrawal') {
    const name = String(declarationName ?? '').trim();
    const contact = String(receiptEmail ?? '').trim().toLowerCase();
    if (!name || name.length > 200) throw new Error('Your name is required for the withdrawal declaration.');
    if (!contact || contact.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      throw new Error('A valid email is required for the withdrawal acknowledgement.');
    }
    requestBody.declaration_name = name;
    requestBody.receipt_email = contact;
  }

  const { data, error } = await client.functions.invoke('cancel-booking', {
    body: requestBody,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.cancellation ?? data;
}
