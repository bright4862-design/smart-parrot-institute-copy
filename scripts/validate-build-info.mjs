import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = process.argv[2] || 'dist/build-info.json';
const info = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.match(info.git_sha, /^[0-9a-f]{40}$/i);
assert.ok(info.git_ref);
assert.ok(!Number.isNaN(Date.parse(info.build_timestamp)));
assert.ok(info.environment);
assert.ok(info.release_version);
assert.equal(info.repository, process.env.GITHUB_REPOSITORY || 'bright4862-design/smart-parrot-institute-copy');
assert.match(info.artifact_digest, /^sha256:[0-9a-f]{64}$/i);
if (process.env.EXPECTED_SHA) assert.equal(info.git_sha, process.env.EXPECTED_SHA);
if (process.env.EXPECTED_ARTIFACT_DIGEST) assert.equal(info.artifact_digest, process.env.EXPECTED_ARTIFACT_DIGEST);
console.log(`Build identity valid for ${info.git_sha} (${info.artifact_digest})`);
