import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { brotliDecompressSync } from 'node:zlib';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

// Prefer a normal Playwright browser. The Linux-only fallback makes browser
// tests possible in minimal sandboxes; it is never part of the shipped app.
export async function launchBrowser() {
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
  if (existsSync(executablePath)) return chromium.launch({ executablePath });
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('Install a test browser with: npx playwright install chromium');
  }
  const { default: packaged } = await import('@sparticuz/chromium');
  const root = resolve('.cache/chromium');
  if (!existsSync(resolve(root, 'lib/libnspr4.so'))) {
    await mkdir(root, { recursive: true });
    const archive = brotliDecompressSync(
      await readFile(
        new URL('../node_modules/@sparticuz/chromium/bin/al2023.tar.br', import.meta.url),
      ),
    );
    const path = resolve(root, 'libraries.tar');
    await writeFile(path, archive);
    const result = spawnSync('tar', ['-xf', path, '-C', root], { encoding: 'utf8' });
    if (result.status !== 0)
      throw new Error(`Could not extract browser test libraries: ${result.stderr}`);
  }
  const unsafe = [
    '--disable-web-security',
    '--allow-running-insecure-content',
    '--single-process',
    '--disable-site-isolation-trials',
  ];
  return chromium.launch({
    executablePath: await packaged.executablePath(),
    args: packaged.args.filter((arg) => !unsafe.some((flag) => arg.startsWith(flag))),
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${resolve(root, 'lib')}:${process.env.LD_LIBRARY_PATH || ''}`,
    },
  });
}
