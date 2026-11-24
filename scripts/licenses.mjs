// Deterministic dependency notice inventory. This is not a substitute for a
// distribution/legal review, including separately bundled OS/shared libraries.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, isAbsolute, sep } from 'node:path';

const output = 'public/licenses';
const cache = '.cache/release/cargo-metadata.json';
const cargoLock = await readFile('Cargo.lock');
const lockHash = createHash('sha256').update(cargoLock).digest('hex');
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const components = [];
const missing = [];
const sections = [
  'FOCUS — DEPENDENCY NOTICES',
  'The application is MIT licensed. Dependencies retain their own terms.',
  'This inventory covers the npm production dependency closure and, when generated for a native package, the resolved Cargo graph. It does not certify the licenses of operating-system libraries, model weights, installer tools, or every file added by a platform bundler. Those require separate release review.',
  await readFile('LICENSE', 'utf8'),
];
const pattern = /^(licen[cs]e|copying|notice|copyright|ofl)([-._].*)?$/i;
async function add(name, version, license, source, directory, explicitFile) {
  const names = (await readdir(directory)).filter((name) => pattern.test(name)).sort();
  if (explicitFile) {
    const requested = isAbsolute(explicitFile) ? explicitFile : resolve(directory, explicitFile);
    if (requested.startsWith(resolve(directory) + sep)) {
      const file = relative(directory, requested);
      if (!names.includes(file)) names.push(file);
    }
  }
  const texts = [];
  for (const file of names) {
    const path = join(directory, file);
    const bytes = await readFile(path).catch(() => null);
    if (bytes && bytes.length && bytes.length <= 262_144 && !bytes.includes(0))
      texts.push(`${file}\n${bytes.toString('utf8')}`);
  }
  const id = `${source}:${name}@${version}`;
  components.push({
    name,
    version,
    source,
    license: license || 'UNDECLARED',
    noticeFiles: texts.map((text) => text.split('\n')[0]),
  });
  if (!license || !texts.length) missing.push(id);
  sections.push(
    `\n${'='.repeat(72)}\n${id}\nDeclared license: ${license || 'UNDECLARED'}\n${texts.length ? texts.join('\n\n') : 'NOTICE FILE NOT FOUND — manual release review required.'}`,
  );
}
for (const [path, dependency] of Object.entries(lock.packages).sort(([a], [b]) =>
  a.localeCompare(b, 'en'),
)) {
  if (!path || dependency.dev) continue;
  const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  if (pkg.version !== dependency.version)
    throw new Error(`Installed version does not match lockfile: ${path}`);
  await add(pkg.name, pkg.version, pkg.license, 'npm', path, null);
}
let metadata;
if (process.argv.includes('--rust')) {
  metadata = JSON.parse(
    execFileSync('cargo', ['metadata', '--locked', '--format-version', '1'], {
      encoding: 'utf8',
      maxBuffer: 30 * 1024 * 1024,
    }),
  );
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(cache, JSON.stringify({ lockHash, metadata }));
} else {
  const saved = JSON.parse(await readFile(cache, 'utf8').catch(() => 'null'));
  if (saved?.lockHash === lockHash) metadata = saved.metadata;
}
if (metadata) {
  const packages = metadata.packages
    .filter((pkg) => !metadata.workspace_members.includes(pkg.id))
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'));
  for (const pkg of packages)
    await add(
      pkg.name,
      pkg.version,
      pkg.license,
      'cargo',
      dirname(pkg.manifest_path),
      pkg.license_file,
    );
}
const report = {
  schemaVersion: 1,
  nativeCargoIncluded: !!metadata,
  cargoLockSha256: lockHash,
  components,
  missingNoticeReview: missing,
  systemLibrariesReviewed: false,
  modelWeightsIncluded: false,
};
await mkdir(output, { recursive: true });
await writeFile(join(output, 'ALL-THIRD-PARTY-NOTICES.txt'), sections.join('\n\n') + '\n');
await writeFile(join(output, 'DEPENDENCIES.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  `Notices: ${components.length} dependencies; Cargo included: ${!!metadata}; missing/undeclared: ${missing.length}.`,
);
if (missing.length) console.warn(`Manual notice review required: ${missing.join(', ')}`);
