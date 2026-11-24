// Linux WebKitGTK + real Tauri/Rust IPC smoke. This is a headless native UI
// test, not a GNOME/Wayland permission, hardware, accessibility, or soak test.
import { spawn } from 'node:child_process';
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  mkdtemp,
  rename,
  rmdir,
  stat,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { nativeScripts } from './webdriver-scripts.mjs';

const output = resolve('.cache/native-smoke');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
let workspacePath;
const application = resolve(process.argv[2] || 'target/release/focus-desktop');
const base = 'http://127.0.0.1:4444';
let session;
let driverLog = '';
let checks = 0;
const driver = spawn('tauri-driver', ['--port', '4444'], {
  env: {
    ...process.env,
    XDG_DATA_HOME: join(profile, 'data'),
    XDG_CONFIG_HOME: join(profile, 'config'),
    XDG_CACHE_HOME: join(profile, 'cache'),
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
  return Object.hasOwn(json, 'value') ? json.value : json;
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
const text = (selector) => execute(nativeScripts.text, [selector]);
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
const button = async (label, scope = '', nextLabel) => {
  const found = await wait(() => execute(nativeScripts.hasButton, [label, scope]), label);
  assert(found);
  await execute(nativeScripts.clickButton, [label, scope]);
  if (nextLabel)
    await wait(() => execute(nativeScripts.hasButton, [nextLabel, scope]), `${label} acknowledged`);
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
  await check(
    'first-run native setup is optional, permission-free, and leads to the timer',
    async () => {
      await wait(() => text('.setup-wizard .setup-step-heading'), 'native first-run setup');
      assert((await text('.setup-wizard')).includes('No special permissions needed to begin.'));
      for (let step = 0; step < 4; step++) {
        await button('Continue', '.setup-wizard');
        await wait(
          async () => (await text('.setup-wizard .eyebrow')).includes(`STEP ${step + 2} OF 5`),
          `setup step ${step + 2} acknowledged`,
        );
      }
      assert((await text('.setup-review')).includes('Off · choose a source per session'));
      assert((await text('.setup-review')).includes('Off · not tested (optional)'));
      await button('Set my first timer', '.setup-wizard');
      await wait(
        () => execute(nativeScripts.hasSelector, ['#intention-title']),
        'configured first timer form',
      );
      await button('Not now', '.modal');
      await wait(async () => !(await text('.modal')), 'setup exit acknowledged');
    },
  );
  await check('native sessions start, pause, and resume through IPC', async () => {
    await button('Start focus');
    await fill('#intention-title', 'Native smoke fixture');
    await fill('#session-duration', '1');
    await button('Begin session', '.modal');
    await wait(
      async () => !!(await execute(nativeScripts.hasButton, ['Pause session', '.session-card'])),
      'running session',
    );
    await sleep(2200);
    assert.notEqual(await text('[data-testid="session-timer"]'), '01:00');
    await button('Pause session', '.session-card', 'Resume session');
    const paused = await text('[data-testid="session-timer"]');
    await sleep(1600);
    assert.equal(await text('[data-testid="session-timer"]'), paused);
    await button('Resume session', '.session-card', 'Pause session');
    await sleep(1300);
    await button('Pause session', '.session-card', 'Resume session');
  });
  await check(
    'native files persist validated task recovery without sensor or chat fields',
    async () => {
      const path = await wait(
        async () =>
          (await files(join(profile, 'data'))).find((file) => file.endsWith('/workspace-v1.json')),
        'native workspace file',
      );
      const saved = await wait(async () => {
        const data = JSON.parse(await readFile(path, 'utf8'));
        return data.checkpoint?.phase === 'paused' ? data : null;
      }, 'paused native checkpoint');
      workspacePath = path;
      assert.equal(saved.checkpoint.task, 'Native smoke fixture');
      assert.equal(saved.settings.setupCompleted, true);
      assert.deepEqual(Object.keys(saved).sort(), [
        'checkpoint',
        'intentions',
        'schemaVersion',
        'sessions',
        'settings',
      ]);
      assert(!/cameraFrames|landmarks|rhythmBaseline|apiKey|chat/.test(JSON.stringify(saved)));
      const rendererOrigin = await execute(nativeScripts.timeOrigin);
      assert(Number.isFinite(rendererOrigin));
      await execute(nativeScripts.reload);
      await wait(
        () => execute(nativeScripts.reloadReady, [rendererOrigin]),
        'new renderer document',
      );
      await wait(
        async () => (await text('.runtime-badge')).includes('Desktop · Rust'),
        'native reload',
      );
      await wait(
        async () => !!(await execute(nativeScripts.hasButton, ['Resume session', '.session-card'])),
        'live Rust engine remains paused after renderer reload',
      );
    },
  );
  await check('finish creates real native history and a chosen break stays escapable', async () => {
    await click('button[aria-label="End session"]');
    await button('Finish session', '.modal');
    await wait(async () => !(await text('.modal')), 'finish acknowledged');
    await button('Your insights');
    await wait(
      async () => (await text('.history-row')).includes('Native smoke fixture'),
      'native history',
    );
    await button('Focus room');
    await button('Make room for rest');
    await button('Begin break', '.modal');
    await wait(
      async () => !!(await execute(nativeScripts.hasSelector, ['button[aria-label="End break"]'])),
      'chosen break',
    );
    await click('button[aria-label="End break"]');
    await wait(
      async () => (await text('.session-card')).includes('Start focus'),
      'voluntary break exit',
    );
  });
  await check(
    'the native companion is a separate least-privileged window with voluntary rest',
    async () => {
      const mainWindow = await request(`/session/${session}/window`);
      await click('button[aria-label="Desktop companion preferences"]');
      await wait(() => text('.companion-capability'), 'desktop companion preferences');
      await click('button[role="switch"][aria-label="Desktop corner timer"]');
      const overlay = await wait(
        async () =>
          (await request(`/session/${session}/window/handles`)).find(
            (handle) => handle !== mainWindow,
          ),
        'separate companion webview',
      );
      await request(`/session/${session}/window`, 'POST', { handle: overlay });
      await wait(
        () => execute(nativeScripts.hasSelector, ['.corner-companion']),
        'small companion entry',
      );
      assert.equal(
        await execute(nativeScripts.hasSelector, ['.app-shell']),
        false,
        'overlay must not mount the workspace/persistence hook',
      );
      assert.equal(
        await execute(nativeScripts.mainOnlyDenied),
        true,
        'companion cannot invoke main-only commands',
      );
      await execute(nativeScripts.focusSelector, ['.corner-tab']);
      await button('A little rest', '.corner-companion');
      await request(`/session/${session}/window`, 'POST', { handle: mainWindow });
      await wait(
        async () => (await text('.modal h2')).includes('You can put it down for a moment.'),
        'voluntary rest requested through native boundary',
      );
      await button('Leave this space', '.modal');
      await wait(async () => !(await text('.modal')), 'rest exit without a game or timer');
      await click('button[role="switch"][aria-label="Desktop corner timer"]');
    },
  );
  await check('a real close-time storage failure keeps the window escapable', async () => {
    assert(workspacePath);
    await sleep(600);
    const backup = `${workspacePath}.test-backup`;
    await rename(workspacePath, backup);
    await mkdir(workspacePath);
    try {
      // Trigger the normal, capability-checked window close IPC, equivalent to
      // the native close control. No app-specific automation command exists.
      await execute(nativeScripts.requestClose);
      await wait(
        async () => (await text('.modal h2')).includes('Your last changes aren’t saved yet'),
        'close failure dialog',
      );
      assert((await stat(workspacePath)).isDirectory());
      assert.equal(JSON.parse(await readFile(backup, 'utf8')).schemaVersion, 1);
      await button('Keep open', '.modal');
      await wait(async () => !(await text('.modal')), 'close failure dismissed without exiting');
      assert((await text('.error-banner')).includes('kept open'));
    } finally {
      await rmdir(workspacePath);
      await rename(backup, workspacePath);
    }
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
  if (process.env.GITHUB_ACTIONS)
    console.log(
      `::notice title=Native WebKit smoke::${checks} real Tauri/Rust/WebKit checks passed; Xvfb only, not physical-device QA.`,
    );
} catch (error) {
  if (session) {
    const state = await execute(nativeScripts.diagnostics).catch(() => null);
    if (state) {
      await writeFile(join(output, 'failure-ui.json'), JSON.stringify(state, null, 2));
      if (process.env.GITHUB_ACTIONS)
        console.log(
          `::notice title=Isolated native test UI::${JSON.stringify(state).replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D')}`,
        );
    }
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
