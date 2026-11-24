import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { RELEASE_TARGETS } from './release-lib.mjs';

const [bundleRoot, outputRoot, target, channel = 'unsigned-test'] = process.argv.slice(2);
if (
  !bundleRoot ||
  !outputRoot ||
  !target ||
  !['unsigned-test', 'signed-candidate'].includes(channel)
)
  throw new Error(
    'Usage: package-artifacts.mjs bundleRoot outputRoot target [unsigned-test|signed-candidate]',
  );
assert(RELEASE_TARGETS.includes(target), 'Unexpected package target');
const qaApprovalProvided =
  channel === 'signed-candidate' && process.env.NATIVE_QA_APPROVED === 'true';
const platformSignaturesVerified =
  channel === 'signed-candidate' &&
  target !== 'linux-x86_64' &&
  process.env.PLATFORM_SIGNATURES_VERIFIED === 'true';
if (channel === 'signed-candidate') {
  assert(qaApprovalProvided, 'Owner native-QA approval is required');
  if (target !== 'linux-x86_64')
    assert(platformSignaturesVerified, 'Platform signature verification is required');
}
const output = resolve(outputRoot);
await mkdir(output, { recursive: true });
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const formats = { deb: '.deb', appimage: '.AppImage', nsis: '.exe', msi: '.msi', dmg: '.dmg' };
const packages = [];
for (const [folder, suffix] of Object.entries(formats)) {
  for (const file of await readdir(join(bundleRoot, folder)).catch(() => [])) {
    if (!file.endsWith(suffix)) continue;
    const path = join(bundleRoot, folder, file);
    if (!(await stat(path)).isFile()) continue;
    const name = `${target}-${basename(file)}`;
    await copyFile(path, join(output, name));
    const bytes = await readFile(path);
    packages.push({
      name,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
}
if (!packages.length) throw new Error(`No installable packages in ${bundleRoot}`);
packages.sort((a, b) => a.name.localeCompare(b.name, 'en'));
await copyFile('LICENSE', join(output, 'LICENSE.txt'));
await copyFile('docs/RELEASE.md', join(output, 'READ-BEFORE-INSTALLING.md'));
await copyFile(
  'public/licenses/ALL-THIRD-PARTY-NOTICES.txt',
  join(output, `${target}-THIRD-PARTY-NOTICES.txt`),
);
await writeFile(
  join(output, `${target}-SHA256SUMS.txt`),
  packages.map((file) => `${file.sha256}  ${file.name}\n`).join(''),
);
await writeFile(
  join(output, `${target}-manifest.json`),
  JSON.stringify(
    {
      schemaVersion: 1,
      application: 'Focus',
      version: pkg.version,
      revision,
      target,
      channel,
      qaApprovalProvided,
      platformSignaturesVerified,
      physicalHardwareTestedByCi: false,
      publicStableReleaseApproved: false,
      packages,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ output, revision, target, channel, packages }, null, 2));
