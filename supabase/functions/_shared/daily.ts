const DAILY_API = 'https://api.daily.co/v1';

function dailyApiKey() {
  const key = Deno.env.get('DAILY_API_KEY')?.trim();
  if (!key || key.length < 16) {
    throw new Error('daily_test_configuration_required');
  }
  return key;
}

async function dailyRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${dailyApiKey()}`);
  headers.set('Content-Type', 'application/json');

  return fetch(`${DAILY_API}${path}`, {
    ...init,
    headers,
  });
}

function unixSeconds(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) throw new Error('invalid_lesson_time');
  return Math.floor(ms / 1000);
}

function assertRoom(room: Record<string, unknown>, bookingId: string) {
  if (room.name !== bookingId || room.privacy !== 'private') {
    throw new Error('daily_room_integrity_failed');
  }
  if (typeof room.url !== 'string' || !room.url.startsWith('https://')) {
    throw new Error('daily_room_url_missing');
  }
  return room;
}

export async function ensurePrivateDailyRoom(
  bookingId: string,
  startsAt: string,
  endsAt: string,
) {
  const existing = await dailyRequest(`/rooms/${encodeURIComponent(bookingId)}`);

  if (existing.ok) {
    const room = await existing.json() as Record<string, unknown>;
    return assertRoom(room, bookingId);
  }

  if (existing.status !== 404) {
    throw new Error(`daily_room_lookup_failed:${existing.status}`);
  }

  const starts = unixSeconds(startsAt);
  const ends = unixSeconds(endsAt);
  const created = await dailyRequest('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name: bookingId,
      privacy: 'private',
      properties: {
        nbf: starts - 15 * 60,
        exp: ends,
        eject_at_room_exp: true,
      },
    }),
  });

  if (!created.ok) {
    throw new Error(`daily_room_create_failed:${created.status}`);
  }

  const room = await created.json() as Record<string, unknown>;
  return assertRoom(room, bookingId);
}

export async function createDailyMeetingToken({
  bookingId,
  userId,
  userName,
  isOwner,
  startsAt,
  endsAt,
}: {
  bookingId: string;
  userId: string;
  userName: string;
  isOwner: boolean;
  startsAt: string;
  endsAt: string;
}) {
  const starts = unixSeconds(startsAt);
  const ends = unixSeconds(endsAt);

  const response = await dailyRequest('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: bookingId,
        user_id: userId,
        user_name: userName.slice(0, 120),
        is_owner: isOwner,
        nbf: starts - 15 * 60,
        exp: ends,
        eject_at_token_exp: true,
        enable_prejoin_ui: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`daily_token_create_failed:${response.status}`);
  }

  const payload = await response.json() as { token?: unknown };
  if (typeof payload.token !== 'string' || payload.token.length < 20) {
    throw new Error('daily_token_missing');
  }

  return payload.token;
}
