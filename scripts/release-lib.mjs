import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
export const RELEASE_TARGETS = ['linux-x86_64', 'macos-universal', 'windows-x86_64'];
export function validateIntent({
  actualSha,
  expectedSha,
  version,
  tag,
  qaApproved,
  licensesApproved,
}) {
  assert(/^[a-f0-9]{40}$/.test(expectedSha), 'Use an exact full commit SHA');
  assert.equal(actualSha, expectedSha, 'The dispatch ref is not the approved commit');
  assert(/^\d+\.\d+\.\d+$/.test(version), 'Invalid base app version');
  assert(
    tag === `v${version}` ||
      new RegExp(`^v${version.replaceAll('.', '\\.')}\-rc\.[1-9][0-9]*$`).test(tag),
    'Tag must match the app version, optionally with -rc.N',
  );
  assert.equal(qaApproved, true, 'Physical native QA approval is required');
  assert.equal(licensesApproved, true, 'Bundled dependency/system-library review is required');
  return { version, tag, revision: expectedSha };
}
export async function verifyManifest(
  manifest,
  directory,
  { revision, version, read = readFile, metadata = lstat },
) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.revision, revision, 'Artifact belongs to another commit');
  assert.equal(manifest.version, version, 'Artifact version mismatch');
  assert.equal(manifest.channel, 'signed-candidate');
  assert.equal(manifest.qaApprovalProvided, true);
  assert(RELEASE_TARGETS.includes(manifest.target), 'Unexpected target');
  if (manifest.target !== 'linux-x86_64')
    assert.equal(
      manifest.platformSignaturesVerified,
      true,
      'Platform signatures were not verified',
    );
  assert(Array.isArray(manifest.packages) && manifest.packages.length > 0, 'Missing packages');
  const seen = new Set();
  for (const file of manifest.packages) {
    assert(
      typeof file.name === 'string' &&
        file.name === basename(file.name) &&
        /^[a-zA-Z0-9_.+-]+$/.test(file.name),
      'Unsafe artifact path',
    );
    assert(!seen.has(file.name), 'Duplicate artifact name');
    seen.add(file.name);
    assert(/\.(AppImage|deb|exe|msi|dmg)$/.test(file.name), 'Unexpected package type');
    const path = join(directory, file.name);
    assert((await metadata(path)).isFile(), 'Artifact must be a regular file, not a symlink');
    const bytes = await read(path);
    assert.equal(bytes.length, file.bytes, 'Artifact size mismatch');
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      file.sha256,
      'Artifact checksum mismatch',
    );
  }
  return manifest.target;
}
