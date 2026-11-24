import { readFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateIntent } from './release-lib.mjs';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const intent = validateIntent({
  actualSha: process.env.GITHUB_SHA,
  expectedSha: process.env.APPROVED_COMMIT,
  version: pkg.version,
  tag: process.env.RELEASE_TAG,
  qaApproved: process.env.QA_APPROVED === 'true',
  licensesApproved: process.env.LICENSES_APPROVED === 'true',
});
const repo = process.env.GITHUB_REPOSITORY;
assert(/^[\w.-]+\/[\w.-]+$/.test(repo));
const environment = JSON.parse(
  execFileSync('gh', ['api', `repos/${repo}/environments/release-signing`], { encoding: 'utf8' }),
);
assert(
  environment.protection_rules?.some(
    (rule) => rule.type === 'required_reviewers' && rule.reviewers?.length > 0,
  ),
  'Configure required reviewers on the release-signing environment before using signing secrets',
);
let object = JSON.parse(
  execFileSync('gh', ['api', `repos/${repo}/git/ref/tags/${intent.tag}`], { encoding: 'utf8' }),
).object;
for (let depth = 0; object.type === 'tag' && depth < 5; depth++)
  object = JSON.parse(
    execFileSync('gh', ['api', `repos/${repo}/git/tags/${object.sha}`], { encoding: 'utf8' }),
  ).object;
assert(
  object.type === 'commit' && object.sha === intent.revision,
  'The existing release tag must resolve to the exact approved commit; protect the tag against later changes',
);
const runs = JSON.parse(
  execFileSync(
    'gh',
    [
      'api',
      `repos/${repo}/actions/workflows/checks.yml/runs?head_sha=${intent.revision}&per_page=100`,
    ],
    { encoding: 'utf8' },
  ),
);
const passed = runs.workflow_runs.find(
  (run) =>
    run.head_sha === intent.revision && run.status === 'completed' && run.conclusion === 'success',
);
assert(passed, 'No fully successful Focus checks run for this exact commit');
const existing = execFileSync('gh', ['api', `repos/${repo}/releases?per_page=100`], {
  encoding: 'utf8',
});
assert(
  !JSON.parse(existing).some((release) => release.tag_name === intent.tag),
  'A release with this tag already exists; never silently replace it',
);
await appendFile(
  process.env.GITHUB_OUTPUT,
  `version=${intent.version}\ntag=${intent.tag}\nrevision=${intent.revision}\nchecks-run=${passed.id}\n`,
);
console.log(
  'Exact-commit checks and explicit release approvals verified. Platform signing and protected-environment approval are still required.',
);
