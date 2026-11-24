import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateIntent, verifyManifest } from './release-lib.mjs';
const sha = 'a'.repeat(40);
const intent = {
  actualSha: sha,
  expectedSha: sha,
  version: '0.1.0',
  tag: 'v0.1.0-rc.1',
  qaApproved: true,
  licensesApproved: true,
};
test('release requires exact commit, valid version/tag, and explicit approvals', () => {
  assert.equal(validateIntent(intent).revision, sha);
  for (const patch of [
    { expectedSha: 'main' },
    { actualSha: 'b'.repeat(40) },
    { tag: 'v9.9.9' },
    { tag: 'v0.1.0-rc.0' },
    { tag: 'v0.1.0-rc.1\nINJECT=x' },
    { qaApproved: false },
    { licensesApproved: false },
  ])
    assert.throws(() => validateIntent({ ...intent, ...patch }));
});
const bytes = Buffer.from('signed-fixture-placeholder-not-a-real-signature');
const manifest = {
  schemaVersion: 1,
  revision: sha,
  version: '0.1.0',
  target: 'windows-x86_64',
  channel: 'signed-candidate',
  qaApprovalProvided: true,
  platformSignaturesVerified: true,
  packages: [
    {
      name: 'windows-x86_64-Focus.exe',
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  ],
};
const options = {
  revision: sha,
  version: '0.1.0',
  read: async () => bytes,
  metadata: async () => ({ isFile: () => true }),
};
test('artifact verification binds expected commit, version, size and hashes', async () => {
  assert.equal(await verifyManifest(manifest, '.', options), 'windows-x86_64');
  for (const patch of [
    { revision: 'b'.repeat(40) },
    { version: '1.0.0' },
    { channel: 'unsigned-test' },
    { qaApprovalProvided: false },
    { platformSignaturesVerified: false },
    { packages: [] },
    { target: 'unknown' },
  ])
    await assert.rejects(verifyManifest({ ...manifest, ...patch }, '.', options));
  await assert.rejects(
    verifyManifest(manifest, '.', { ...options, read: async () => Buffer.from('damaged') }),
  );
});
test('artifact collection rejects path traversal, symlinks, and duplicate names', async () => {
  for (const name of [
    '../secret.exe',
    '/tmp/secret.exe',
    'bad\\secret.exe',
    'cert.pfx',
    'name with spaces.exe',
  ])
    await assert.rejects(
      verifyManifest({ ...manifest, packages: [{ ...manifest.packages[0], name }] }, '.', options),
    );
  await assert.rejects(
    verifyManifest(
      { ...manifest, packages: [...manifest.packages, ...manifest.packages] },
      '.',
      options,
    ),
  );
  await assert.rejects(
    verifyManifest(manifest, '.', { ...options, metadata: async () => ({ isFile: () => false }) }),
  );
});
