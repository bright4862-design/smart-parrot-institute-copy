import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const infoPath = path.join(root, 'build-info.json');
const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return listFiles(absolute);
      return [absolute];
    })
    .filter((file) => file !== infoPath)
    .sort();
}

const hash = crypto.createHash('sha256');
for (const file of listFiles(root)) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const bytes = fs.readFileSync(file);
  hash.update(`${relative}\0${bytes.length}\0`);
  hash.update(bytes);
}

info.artifact_digest = `sha256:${hash.digest('hex')}`;
fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + '\n');
fs.writeFileSync('artifact-digest.txt', `${info.artifact_digest}\n`);
console.log(JSON.stringify(info));
