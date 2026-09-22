import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const app = read('src/App.jsx');
const client = read('src/lib/lessonBookingSupabase.js');
const auth = read('src/lib/LessonBookingAuthContext.jsx');
const api = read('src/lib/lessonBookingApi.js');
const page = read('src/pages/LessonBooking.jsx');
const hub = read('src/pages/LessonBookingHub.jsx');

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  packageJson.dependencies?.['@supabase/supabase-js'] === '2.109.0',
  'Pin @supabase/supabase-js to 2.109.0 while repository smoke CI remains on Node 20.',
);

expect(client.includes("VITE_SUPABASE_URL"), 'Browser client must read VITE_SUPABASE_URL.');
expect(
  client.includes("VITE_SUPABASE_PUBLISHABLE_KEY"),
  'Browser client must read VITE_SUPABASE_PUBLISHABLE_KEY.',
);
expect(
  client.includes("startsWith('sb_publishable_')"),
  'Browser client must fail closed unless it receives a publishable key.',
);
expect(client.includes('persistSession: true'), 'Supabase Auth session persistence must be explicit.');
expect(client.includes('detectSessionInUrl: true'), 'Magic-link redirects must be detected by the client.');

expect(auth.includes('.auth.getSession()'), 'Booking auth provider must initialize from the Supabase session.');
expect(
  auth.includes('.auth.onAuthStateChange('),
  'Booking auth provider must subscribe to Supabase auth changes.',
);
expect(auth.includes('.auth.signInWithOtp('), 'Booking auth provider must use Supabase magic-link auth.');
expect(auth.includes('.auth.signOut()'), 'Booking auth provider must expose Supabase sign-out.');

const availabilityStart = api.indexOf('export async function listAvailableLessonSlots');
const nextExportAfterAvailability = api.indexOf('export async function', availabilityStart + 1);
const availabilityAdapter = availabilityStart >= 0
  ? api.slice(availabilityStart, nextExportAfterAvailability >= 0 ? nextExportAfterAvailability : api.length)
  : '';
expect(
  availabilityAdapter.includes("client.rpc('available_slots'"),
  'Availability adapter must call only the available_slots RPC.',
);
for (const forbiddenMutation of ['.insert(', '.update(', '.upsert(', '.delete(', '.functions.invoke(', 'stripe']) {
  expect(
    !availabilityAdapter.toLowerCase().includes(forbiddenMutation.toLowerCase()),
    `Availability adapter must remain read-only; found ${forbiddenMutation}.`,
  );
}

const cancellationStart = api.indexOf('export async function requestBookingCancellation');
const cancellationAdapter = cancellationStart >= 0 ? api.slice(cancellationStart) : '';
expect(
  cancellationAdapter.includes("client.functions.invoke('cancel-booking'"),
  'Authenticated cancellation may only cross the browser boundary through cancel-booking.',
);
for (const forbiddenField of ['amount_cents:', 'requested_at:', 'policy_version_id:', 'payment_action:', 'stripe_']) {
  expect(
    !cancellationAdapter.toLowerCase().includes(forbiddenField.toLowerCase()),
    `Cancellation browser adapter must not author ${forbiddenField}`,
  );
}

expect(app.includes('path="/lesson-booking"'), 'App must expose the additive /lesson-booking hub route.');
expect(app.includes('path="/book-lessons"'), 'App must expose the isolated /book-lessons route.');
expect(app.includes('path="/my-lessons"'), 'App must preserve the /my-lessons route.');
expect(app.includes('path="/learn"'), 'Booking work must preserve the existing /learn route.');
expect(app.includes('path="/london"'), 'Booking work must preserve the existing /london route.');
expect(app.includes('path="/level-4-cafe"'), 'Booking work must preserve the existing game route.');
expect(
  app.includes('<AuthProvider>'),
  'Existing Base44 app auth wrapper must remain in place for non-booking routes.',
);
expect(
  page.includes('<LessonBookingAuthProvider>'),
  'Lesson booking route must isolate Supabase Auth inside the booking subtree.',
);
expect(
  page.includes('cannot create bookings, charge cards, or modify payment data'),
  'Preview route must make its read-only boundary explicit.',
);

for (const requiredHubLink of ['to="/"', 'to="/book-lessons"', 'to="/my-lessons"']) {
  expect(hub.includes(requiredHubLink), `Booking hub must retain additive navigation ${requiredHubLink}.`);
}
expect(
  hub.includes('Payments are not connected yet'),
  'Booking hub must visibly keep payments unavailable until trusted provider readiness exists.',
);
expect(
  hub.includes('No card details are collected on this page'),
  'Booking hub must tell users the disconnected preview does not collect card details.',
);
expect(
  hub.includes('TEST / preview'),
  'Booking hub must remain visibly marked as preview while provider writes are disabled.',
);
expect(
  hub.includes('getLessonBookingSupabaseStatus'),
  'Booking hub may expose only the browser-safe Supabase configuration status.',
);
for (const forbiddenHubCapability of ['@stripe/', 'loadStripe(', 'functions.invoke(', 'service_role', 'sb_secret_', 'DAILY_API_KEY']) {
  expect(
    !hub.includes(forbiddenHubCapability),
    `Booking hub must stay provider-neutral and browser-safe; found ${forbiddenHubCapability}.`,
  );
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const sourceFiles = walk(path.join(root, 'src'));
const browserSecretPatterns = [
  /VITE_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|STRIPE|DAILY)[A-Z0-9_]*/g,
  /sb_secret_[A-Za-z0-9_-]+/g,
  /SUPABASE_SERVICE_ROLE_KEY/g,
  /SUPABASE_SECRET_KEY/g,
  /sk_(?:live|test)_[A-Za-z0-9_-]+/g,
  /whsec_[A-Za-z0-9_-]+/g,
  /DAILY_API_KEY/g,
];

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of browserSecretPatterns) {
    const matches = source.match(pattern);
    expect(
      !matches?.length,
      `Browser source ${path.relative(root, file)} references a server-only credential: ${matches?.[0]}.`,
    );
  }
}

if (failures.length) {
  console.error('Lesson booking browser boundary failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Lesson booking browser boundary passed (${sourceFiles.length} browser source files scanned; additive booking hub is provider-neutral, payment-disabled, and existing app routes remain intact).`);
