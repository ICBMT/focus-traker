import { readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const directory = process.argv[2];
assert(directory, 'Supply the release artifact directory');
const lines = [];
for (const name of (await readdir(directory)).sort()) {
  if (['SHA256SUMS.txt', 'SHA256SUMS.txt.asc'].includes(name)) continue;
  const path = join(directory, name);
  assert((await lstat(path)).isFile(), 'Integrity manifest accepts regular files only');
  assert(/^[a-zA-Z0-9_.+-]+$/.test(name), 'Unsafe integrity-manifest filename');
  lines.push(
    `${createHash('sha256')
      .update(await readFile(path))
      .digest('hex')}  ${name}\n`,
  );
}
assert(lines.length, 'No release files');
await writeFile(join(directory, 'SHA256SUMS.txt'), lines.join(''));
