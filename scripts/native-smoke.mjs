// Linux WebKitGTK + real Tauri/Rust IPC smoke. This is a headless native UI
// test, not a GNOME/Wayland permission, hardware, accessibility, or soak test.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';

const output = resolve('.cache/native-smoke');
await mkdir(output, { recursive: true });
const application = resolve(process.argv[2] || 'target/release/focus-desktop');
const base = 'http://127.0.0.1:4444';
let session;
let driverLog = '';
let checks = 0;
const driver = spawn('tauri-driver', ['--port', '4444'], {
  env: {
    ...process.env,
    XDG_DATA_HOME: join(output, 'data'),
    XDG_CONFIG_HOME: join(output, 'config'),
    XDG_CACHE_HOME: join(output, 'cache'),
    WEBKIT_DISABLE_DMABUF_RENDERER: '1',
    LIBGL_ALWAYS_SOFTWARE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
driver.on('error', (error) => {
  driverLog += error.message;
});
for (const stream of [driver.stdout, driver.stderr])
  stream.on('data', (data) => {
    driverLog = (driverLog + data.toString()).slice(-40_000);
  });
async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const json = await response.json();
  if (!response.ok || json.value?.error)
    throw new Error(`${method} ${path}: ${JSON.stringify(json.value || json)}`);
  return json.value ?? json;
}
async function wait(run, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await run();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(150);
  }
  throw new Error(`Timed out: ${label}${last ? ` (${last.message})` : ''}`);
}
const execute = (script, args = []) =>
  request(`/session/${session}/execute/sync`, 'POST', { script, args });
const text = (selector) =>
  execute('return document.querySelector(arguments[0])?.textContent || ""', [selector]);
const element = async (selector) => {
  const value = await wait(
    () =>
      request(`/session/${session}/element`, 'POST', { using: 'css selector', value: selector }),
    selector,
  );
  return value['element-6066-11e4-a52e-4f735466cecf'];
};
const click = async (selector) =>
  request(`/session/${session}/element/${await element(selector)}/click`, 'POST', {});
const fill = async (selector, value) => {
  const id = await element(selector);
  await request(`/session/${session}/element/${id}/clear`, 'POST', {});
  await request(`/session/${session}/element/${id}/value`, 'POST', {
    text: value,
    value: [...value],
  });
};
const button = async (label, scope = '') => {
  const found = await wait(
    () =>
      execute(
        'const root = arguments[1] ? document.querySelector(arguments[1]) : document; return root && [...root.querySelectorAll("button")].some(b => b.textContent.trim() === arguments[0] && !b.disabled);',
        [label, scope],
      ),
    label,
  );
  assert(found);
  await execute(
    'const root = arguments[1] ? document.querySelector(arguments[1]) : document; [...root.querySelectorAll("button")].find(b => b.textContent.trim() === arguments[0] && !b.disabled).click();',
    [label, scope],
  );
};
async function check(name, run) {
  await run();
  checks++;
  console.log(`✓ native: ${name}`);
}
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const result = [];
  for (const entry of entries)
    result.push(
      ...(entry.isDirectory()
        ? await files(join(directory, entry.name))
        : [join(directory, entry.name)]),
    );
  return result;
}
try {
  await wait(() => request('/status'), 'tauri-driver ready');
  const created = await request('/session', 'POST', {
    capabilities: { alwaysMatch: { 'tauri:options': { application } } },
  });
  session = created.sessionId;
  assert(session, 'No native WebDriver session');
  await check('actual native window identifies its Rust engine', async () => {
    await wait(
      async () => (await text('.runtime-badge')).includes('Desktop · Rust'),
      'native Rust runtime',
    );
    await wait(() => text('.session-card'), 'workspace initialization');
    assert.equal(await text('[data-testid="session-timer"]'), '25:00');
  });
  await check('native sessions start, pause, and resume through IPC', async () => {
    await button('Start focus');
    await fill('#intention-title', 'Native smoke fixture');
    await fill('#session-duration', '1');
    await button('Begin session', '.modal');
    await wait(
      async () =>
        !!(await execute(
          'return !!document.querySelector("button[aria-label=\"Pause session\"]")',
        )),
      'running session',
    );
    await sleep(2200);
    assert.notEqual(await text('[data-testid="session-timer"]'), '01:00');
    await click('button[aria-label="Pause session"]');
    const paused = await text('[data-testid="session-timer"]');
    await sleep(1600);
    assert.equal(await text('[data-testid="session-timer"]'), paused);
    await click('button[aria-label="Resume session"]');
    await sleep(1300);
    await click('button[aria-label="Pause session"]');
  });
  await check(
    'native files persist validated task recovery without sensor or chat fields',
    async () => {
      const path = await wait(
        async () =>
          (await files(join(output, 'data'))).find((file) => file.endsWith('/workspace-v1.json')),
        'native workspace file',
      );
      const saved = await wait(async () => {
        const data = JSON.parse(await readFile(path, 'utf8'));
        return data.checkpoint?.phase === 'paused' ? data : null;
      }, 'paused native checkpoint');
      assert.equal(saved.checkpoint.task, 'Native smoke fixture');
      assert.deepEqual(Object.keys(saved).sort(), [
        'checkpoint',
        'intentions',
        'schemaVersion',
        'sessions',
        'settings',
      ]);
      assert(!/cameraFrames|landmarks|rhythmBaseline|apiKey|chat/.test(JSON.stringify(saved)));
      await execute('window.location.reload(); return true;');
      await wait(
        async () => (await text('.runtime-badge')).includes('Desktop · Rust'),
        'native reload',
      );
      await wait(
        async () =>
          !!(await execute(
            'return !!document.querySelector("button[aria-label=\"Resume session\"]")',
          )),
        'live Rust engine remains paused after renderer reload',
      );
    },
  );
  await check('finish creates real native history and a chosen break stays escapable', async () => {
    await click('button[aria-label="End session"]');
    await button('Finish session', '.modal');
    await button('Your insights');
    await wait(
      async () => (await text('.history-row')).includes('Native smoke fixture'),
      'native history',
    );
    await button('Focus room');
    await button('Make room for rest');
    await button('Begin break', '.modal');
    await wait(
      async () =>
        !!(await execute('return !!document.querySelector("button[aria-label=\"End break\"]")')),
      'chosen break',
    );
    await click('button[aria-label="End break"]');
    await wait(
      async () => (await text('.session-card')).includes('Start focus'),
      'voluntary break exit',
    );
  });
  const screenshot = await request(`/session/${session}/screenshot`);
  await writeFile(join(output, 'native-window.png'), Buffer.from(screenshot, 'base64'));
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify(
      {
        checks,
        nativeWebView: 'Linux WebKitGTK / Xvfb',
        realHardwareValidated: false,
        revision: process.env.GITHUB_SHA || null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (session) {
    const screenshot = await request(`/session/${session}/screenshot`).catch(() => null);
    if (screenshot) await writeFile(join(output, 'failure.png'), Buffer.from(screenshot, 'base64'));
  }
  console.error(error.stack || error);
  if (process.env.GITHUB_ACTIONS)
    console.log(
      `::error title=Native WebKit smoke failed::${String(error.message).replaceAll('%', '%25').replaceAll('\n', '%0A')}`,
    );
  process.exitCode = 1;
} finally {
  if (session) await request(`/session/${session}`, 'DELETE').catch(() => {});
  driver.kill('SIGTERM');
  await writeFile(join(output, 'driver.log'), driverLog);
}
