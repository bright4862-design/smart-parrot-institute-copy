const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date;
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
