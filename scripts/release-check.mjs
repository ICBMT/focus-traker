import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const pkg = await json('package.json');
const lock = await json('package-lock.json');
const tauri = await json('src-tauri/tauri.conf.json');
const cargo = await readFile('Cargo.toml', 'utf8');
assert.equal(pkg.version, lock.version, 'npm version mismatch');
assert.equal(pkg.version, tauri.version, 'Tauri/npm version mismatch');
assert(cargo.includes(`version = "${pkg.version}"`), 'Cargo/npm version mismatch');
assert.equal(pkg.license, 'MIT');
assert.equal(tauri.bundle.license, 'MIT');
assert((await readFile('LICENSE', 'utf8')).includes('MIT License'));
for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }))
  assert(/^\d+\.\d+\.\d+([-.][\w.-]+)?$/.test(version), `Unpinned npm dependency: ${name}`);
for (const icon of tauri.bundle.icon) await access(`src-tauri/${icon}`);
for (const path of ['docs/RELEASE.md', 'docs/NATIVE_QA.md', 'SECURITY.md']) await access(path);
const csp = tauri.app.security.csp;
assert(
  !csp.includes("'unsafe-eval'") && !csp.includes('https:') && !csp.includes(' *'),
  'Unexpected release CSP widening',
);
assert(!tauri.app.withGlobalTauri, 'Unnecessary global Tauri surface');
assert.equal(tauri.bundle.macOS.hardenedRuntime, true);
assert.equal(tauri.bundle.windows.allowDowngrades, false);
assert(
  !tauri.plugins?.updater,
  'An updater needs its own signature/integrity validation before being enabled',
);
if (process.argv.includes('--native')) {
  const report = await json('public/licenses/DEPENDENCIES.json');
  assert.equal(report.nativeCargoIncluded, true, 'Native dependency notices were not generated');
  assert.equal(
    report.missingNoticeReview.length,
    0,
    `Missing notice files: ${report.missingNoticeReview.join(', ')}`,
  );
}
console.log(
  'Release source/configuration preflight passed. Signing, packaged-library review, physical-device QA, and production approval are separate gates.',
);
