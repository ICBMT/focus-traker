// Preserve a command's exit code and make failures readable through the
// GitHub Checks annotations API when an Actions log-download host is blocked.
// Use only for non-secret build/test commands, never signing or credential setup.
import { spawn } from 'node:child_process';
const args = process.argv.slice(process.argv.indexOf('--') + 1);
if (!args.length || process.argv.indexOf('--') < 0)
  throw new Error('Usage: node scripts/run-check.mjs -- command args');
let tail = '';
const command = process.platform === 'win32' && args[0] === 'npm' ? 'npm.cmd' : args[0];
const child = spawn(command, args.slice(1), {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32' && command.endsWith('.cmd'),
});
for (const [stream, destination] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
])
  stream.on('data', (chunk) => {
    destination.write(chunk);
    tail = (tail + chunk.toString()).slice(-24_000);
  });
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('close', (code) => {
  if (code === 0 && process.env.GITHUB_ACTIONS && args[0] === 'cargo' && args[1] === 'test') {
    const results = tail.match(/test result: ok[^\n]*/g) || [];
    if (results.length)
      console.log(
        `::notice title=Native Rust test results::${results.join(' | ').replaceAll('%', '%25')}`,
      );
  }
  if (code !== 0) {
    const escaped = tail.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    if (process.env.GITHUB_ACTIONS)
      console.log(`::error title=Build or test command failed::${escaped}`);
    process.exitCode = code || 1;
  }
});
