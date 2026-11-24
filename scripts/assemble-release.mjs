import { readdir, mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { RELEASE_TARGETS, verifyManifest } from './release-lib.mjs';
const [input, output] = process.argv.slice(2);
assert(input && output, 'Usage: assemble-release.mjs downloaded-artifacts output');
await mkdir(output, { recursive: true });
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const revision = process.env.GITHUB_SHA;
const targets = new Set();
const copies = new Set();
for (const directory of await readdir(input, { withFileTypes: true })) {
  assert(directory.isDirectory() && !directory.isSymbolicLink(), 'Unexpected artifact entry');
  const root = join(input, directory.name);
  const files = await readdir(root);
  const manifests = files.filter((file) => file.endsWith('-manifest.json'));
  assert.equal(manifests.length, 1, 'Each target must have exactly one manifest');
  const manifest = JSON.parse(await readFile(join(root, manifests[0]), 'utf8'));
  const target = await verifyManifest(manifest, root, { version, revision });
  assert(!targets.has(target), 'Duplicate target');
  targets.add(target);
  const names = [
    ...manifest.packages.map((file) => file.name),
    manifests[0],
    `${target}-THIRD-PARTY-NOTICES.txt`,
  ];
  for (const name of names) {
    assert(!copies.has(name), 'Conflicting release filename');
    copies.add(name);
    await copyFile(join(root, name), join(output, name));
  }
}
assert.deepEqual([...targets].sort(), RELEASE_TARGETS);
await copyFile('LICENSE', join(output, 'LICENSE.txt'));
await copyFile('docs/RELEASE.md', join(output, 'READ-BEFORE-INSTALLING.md'));
const sourceName = `Focus-${version}-source.tar.gz`;
execFileSync('git', [
  'archive',
  '--format=tar.gz',
  `--prefix=Focus-${version}/`,
  '-o',
  join(output, sourceName),
  'HEAD',
]);
await writeFile(
  join(output, 'release-manifest.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      version,
      revision,
      tag: process.env.RELEASE_TAG,
      targets: [...targets].sort(),
      qaApprovalProvided: true,
      physicalHardwareTestedByCi: false,
      publicStableReleaseApproved: false,
      checksRun: process.env.CHECKS_RUN,
      draftPrereleaseOnly: true,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  join(output, 'RELEASE-NOTES.md'),
  `# Focus ${process.env.RELEASE_TAG}\n\nSigned **release candidate**, commit ${revision}. Draft/prerelease status requires owner review before any public stable release.\n\nTask sessions, optional breaks/game, local history/recovery, offline guidance, optional native Ollama, foreground camera preview, and a test-pad-only cadence experiment. No global monitoring, camera inference, mood/boredom/flow detector, real notification suppression, remote provider, OS lock, overlay, or updater.\n\nSee READ-BEFORE-INSTALLING.md and the per-platform manifests/notices. Verify platform signatures and the detached checksum signature using the independently verified publisher key.\n`,
);
// RELEASE-KEY.asc must be exported into output before running --checksums.
if (process.argv.includes('--checksums')) await checksums();
async function checksums() {
  const names = (await readdir(output))
    .filter((name) => !['SHA256SUMS.txt', 'SHA256SUMS.txt.asc'].includes(name))
    .sort();
  const lines = [];
  for (const name of names)
    lines.push(
      `${createHash('sha256')
        .update(await readFile(join(output, name)))
        .digest('hex')}  ${name}\n`,
    );
  await writeFile(join(output, 'SHA256SUMS.txt'), lines.join(''));
}
if (!process.argv.includes('--checksums'))
  console.log(
    'Release artifacts assembled; export the public key, then run scripts/checksums.mjs before signing.',
  );
