import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preview } from 'vite';
import { launchBrowser } from './browser.mjs';

const artifacts = '.cache/e2e';
await mkdir(artifacts, { recursive: true });
let server, browser, context, page;
let passed = 0;
const errors = [],
  outbound = [],
  audits = [];
async function check(name, run) {
  await run();
  passed++;
  console.log(`✓ ${name}`);
}
try {
  let url = process.env.BASE_URL;
  if (!url) {
    server = await preview({ preview: { host: '0.0.0.0', port: 1421, strictPort: true } });
    url = 'http://127.0.0.1:1421';
  }
  browser = await launchBrowser();
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    window.__cameraRequests = 0;
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async () => {
        window.__cameraRequests++;
        throw new DOMException(
          'No hardware is requested by this automated test.',
          'NotAllowedError',
        );
      };
  });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin)
      outbound.push(request.url());
  });
  await page.clock.install({ time: new Date('2026-11-19T09:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-19T09:00:01Z'));
  await page.goto(url);
  const nav = async (name) => {
    const toggle = page.getByRole('button', { name: 'Toggle navigation' });
    if (
      (await toggle.isVisible()) &&
      !(await page
        .locator('.app-shell')
        .evaluate((element) => element.classList.contains('nav-open')))
    )
      await toggle.click();
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name, exact: true })
      .click();
  };
  const advance = async (ms) => {
    await page.clock.runFor(ms);
  };
  const audit = async (name) => {
    const theme = await page.locator('html').getAttribute('data-theme');
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    audits.push({ theme, screen: name, violations: result.violations });
  };
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('focus.workspace.v1') || 'null'));

  await check('fresh workspace has real empty states and no permission request', async () => {
    await expect(page.getByRole('heading', { name: 'Make space for good work.' })).toBeVisible();
    await expect(page.getByTestId('session-timer')).toHaveText('25:00');
    await expect(page.getByRole('heading', { name: 'A clear list. A fresh start.' })).toBeVisible();
    expect(await page.evaluate(() => window.__cameraRequests)).toBe(0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${artifacts}/overview-desktop.png`, fullPage: true });
  });
  await check('intention add, search, complete, and undo work', async () => {
    await page.getByRole('button', { name: 'Add intention', exact: true }).click();
    await page.getByLabel('Your intention', { exact: true }).fill('Draft a thoughtful proposal');
    await page.getByRole('button', { name: 'Add intention', exact: true }).last().click();
    await expect(page.locator('.intention-row')).toContainText('Draft a thoughtful proposal');
    await page.getByRole('button', { name: 'Search intentions' }).click();
    await page.getByRole('textbox', { name: 'Search your intentions' }).fill('thoughtful');
    await expect(page.locator('.search-results')).toContainText('Draft a thoughtful proposal');
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: 'Complete Draft a thoughtful proposal', exact: true })
      .click();
    await page.getByRole('button', { name: 'Show completed', exact: true }).click();
    await page
      .getByRole('button', { name: 'Uncomplete Draft a thoughtful proposal', exact: true })
      .click();
    await page.getByRole('button', { name: 'Delete Draft a thoughtful proposal' }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.intention-row')).toHaveCount(1);
  });
  await check('focus timer pauses, resumes, completes, and never forces a break', async () => {
    await page.getByRole('button', { name: 'Start focus', exact: true }).click();
    await page.getByLabel('Your intention', { exact: true }).fill('Draft a thoughtful proposal');
    await page.getByRole('spinbutton', { name: 'Session duration in minutes' }).fill('1');
    await page.getByRole('button', { name: 'Begin session', exact: true }).click();
    await expect(page.getByTestId('session-timer')).toHaveText('01:00');
    await advance(5000);
    await page.getByRole('button', { name: 'Pause session', exact: true }).click();
    const paused = await page.getByTestId('session-timer').textContent();
    await advance(20_000);
    await expect(page.getByTestId('session-timer')).toHaveText(paused);
    await page.getByRole('button', { name: 'Resume session', exact: true }).click();
    await advance(56_000);
    await expect(page.getByRole('button', { name: 'Done for now', exact: true })).toBeVisible();
    await expect(page.getByTestId('session-timer')).toHaveText('00:00');
    await expect(page.getByRole('button', { name: 'End break', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Done for now', exact: true }).click();
    await page.getByRole('button', { name: 'Finish session', exact: true }).click();
    await advance(500);
    expect((await saved()).sessions).toEqual([
      expect.objectContaining({ kind: 'focus', durationMs: 60_000, completed: true }),
    ]);
  });
  await check('history persists with a voluntary, editable check-in', async () => {
    await nav('Your insights');
    await expect(page.locator('.history-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Check in', exact: true }).click();
    await page.getByRole('button', { name: 'In the zone', exact: true }).click();
    await advance(500);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Make space for good work.' })).toBeVisible();
    await nav('Your insights');
    await expect(page.locator('.history-row')).toContainText('In the zone');
  });
  await check(
    'restart recovery is optional, stays paused, and can be deferred safely',
    async () => {
      await nav('Focus room');
      await page.getByRole('button', { name: 'Start focus', exact: true }).click();
      await page.getByLabel('Your intention', { exact: true }).fill('A recoverable session');
      await page.getByRole('button', { name: 'Begin session', exact: true }).click();
      await advance(2500);
      await page.getByRole('button', { name: 'Pause session', exact: true }).click();
      await advance(500);
      await page.reload();
      await expect(page.getByRole('dialog', { name: 'Pick up where you left off?' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Pick up where you left off?' })).toHaveCount(
        0,
      );
      expect((await saved()).checkpoint).not.toBeNull();
      await page.getByRole('button', { name: 'Review checkpoint' }).click();
      await page.getByRole('button', { name: 'Recover paused session' }).click();
      await expect(page.getByRole('button', { name: 'Resume session', exact: true })).toBeVisible();
      const paused = await page.getByTestId('session-timer').textContent();
      await advance(5000);
      await expect(page.getByTestId('session-timer')).toHaveText(paused);
      await page.getByRole('button', { name: 'End session', exact: true }).click();
      await page.getByRole('button', { name: 'Finish session', exact: true }).click();
    },
  );
  await check('a short chosen break is immediately escapable', async () => {
    await nav('Focus room');
    await page.getByRole('button', { name: 'Make room for rest' }).click();
    await page.getByRole('button', { name: /Look a little further/ }).click();
    await page.getByRole('button', { name: 'Begin break', exact: true }).click();
    await expect(page.getByRole('button', { name: 'End break', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'A tiny garden game', exact: true }).click();
    await page.getByRole('button', { name: 'Leave the garden', exact: true }).click();
    await advance(1500);
    await page.getByRole('button', { name: 'End break', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start focus', exact: true })).toBeVisible();
  });
  await check('offline companion is labeled and works without a network or model', async () => {
    await page.getByRole('button', { name: 'A little encouragement', exact: true }).click();
    await expect(
      page.getByText('Offline guidance · not an AI model', { exact: true }),
    ).toBeVisible();
    await page.getByRole('textbox', { name: 'Message your companion' }).fill('I feel stuck');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.locator('.chat-message.assistant')).toContainText(
      'make the next step almost too small',
    );
    await page.keyboard.press('Escape');
  });
  await check('sensor lab is explicit, pad-scoped, and stops on page exit', async () => {
    await nav('Your sensors');
    await page.getByRole('button', { name: 'Try camera preview', exact: true }).click();
    expect(await page.evaluate(() => window.__cameraRequests)).toBe(0);
    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await page.getByRole('button', { name: 'Try input rhythm', exact: true }).click();
    await page.getByRole('button', { name: 'Start test-pad experiment', exact: true }).click();
    await page.getByRole('textbox', { name: 'Rhythm test pad' }).click();
    await page.keyboard.type('deliberate test input', { delay: 130 });
    await advance(6000);
    await expect(page.locator('.lab-metrics')).not.toContainText('deliberate test input');
    await page.getByRole('button', { name: 'Use current sample' }).click();
    await expect(page.getByRole('status')).toContainText('Comparison sample saved in memory');
    await page.getByRole('button', { name: 'Pause session and all sensor tests' }).click();
    await expect(page.getByRole('button', { name: 'Try input rhythm' })).toBeVisible();
    await nav('Overview');
    await nav('Your sensors');
    await expect(page.getByRole('button', { name: 'Try input rhythm' })).toBeVisible();
    expect(await page.evaluate(() => window.__cameraRequests)).toBe(0);
  });
  await check(
    'notification examples explain deferral and release without a real source',
    async () => {
      await nav('Notifications');
      await expect(page.getByText('0 connected sources', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Newsletter', exact: true }).click();
      await page.getByRole('button', { name: 'Test this example', exact: true }).click();
      await expect(page.locator('.decision-item')).toContainText('Explicit low-priority rule');
      await expect(page.locator('.decision-item')).toContainText('Deferred');
      await page.getByRole('button', { name: 'Release digest', exact: true }).click();
      await expect(page.locator('.decision-item')).toContainText('Released');
    },
  );
  await check('theme, export, and history opt-out persist only permitted data', async () => {
    await nav('Preferences');
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.getByRole('button', { name: 'Privacy & data', exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export JSON' }).click(),
    ]);
    const data = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(data.checkpoint).toBeNull();
    expect(data.sessions.length).toBeGreaterThan(0);
    expect(Object.keys(data).sort()).toEqual([
      'checkpoint',
      'intentions',
      'schemaVersion',
      'sessions',
      'settings',
    ]);
    expect(JSON.stringify(data)).not.toMatch(
      /deliberate test input|I feel stuck|rhythmBaseline|apiKey|landmarks|cameraFrames/,
    );
    await page.getByRole('switch', { name: 'Keep session history', exact: true }).click();
    await advance(500);
    expect((await saved()).sessions).toEqual([]);
    await page.getByRole('button', { name: 'Delete all data', exact: true }).click();
    await page.getByRole('button', { name: 'Keep my data', exact: true }).click();
    expect((await saved()).intentions).toHaveLength(1);
    await page.getByRole('button', { name: 'Delete all data', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete all data', exact: true })
      .click();
    await advance(500);
    expect((await saved()).intentions).toEqual([]);
    expect((await saved()).checkpoint).toBeNull();
    expect((await saved()).settings.keepHistory).toBe(true);
  });

  await check('invalid saved data stays read-only until an explicit reset', async () => {
    // Seed corruption before the next document initializes, after the outgoing
    // document's legitimate close-time flush has finished.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('focus.test.invalid-seeded')) {
        localStorage.setItem('focus.workspace.v1', 'null');
        sessionStorage.setItem('focus.test.invalid-seeded', 'true');
      }
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Make space for good work.' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('invalid or unsupported format');
    await nav('Preferences');
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await advance(2000);
    expect(await page.evaluate(() => localStorage.getItem('focus.workspace.v1'))).toBe('null');
    await page.getByRole('button', { name: 'Privacy & data', exact: true }).click();
    await expect(page.getByText('Temporary / read-only', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Delete all data', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete all data', exact: true })
      .click();
    await advance(500);
    expect(await saved()).toEqual({
      schemaVersion: 1,
      settings: {
        focusMinutes: 25,
        breakMinutes: 5,
        dailyGoalMinutes: 120,
        protectFocus: true,
        keepHistory: true,
        theme: 'light',
        reduceMotion: false,
      },
      intentions: [],
      sessions: [],
      checkpoint: null,
    });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  await check(
    'corrupt supported-version fields preserve the exact original until reset',
    async () => {
      const corrupt = JSON.stringify({
        ...(await saved()),
        settings: { ...(await saved()).settings, focusMinutes: 0 },
        unknownField: 'Never silently discard the original',
      });
      await page.addInitScript((raw) => {
        if (!sessionStorage.getItem('focus.test.corrupt-v1-seeded')) {
          localStorage.setItem('focus.workspace.v1', raw);
          sessionStorage.setItem('focus.test.corrupt-v1-seeded', 'true');
        }
      }, corrupt);
      await page.reload();
      await expect(page.getByRole('alert')).toContainText('fields failed validation');
      await nav('Preferences');
      await page.getByRole('button', { name: 'Dark', exact: true }).click();
      await advance(1000);
      expect(await page.evaluate(() => localStorage.getItem('focus.workspace.v1'))).toBe(corrupt);
      await page.reload();
      await expect(page.getByRole('alert')).toContainText('fields failed validation');
      expect(await page.evaluate(() => localStorage.getItem('focus.workspace.v1'))).toBe(corrupt);
      await nav('Preferences');
      await page.getByRole('button', { name: 'Privacy & data', exact: true }).click();
      await expect(page.getByText('Temporary / read-only', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Delete all data', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Delete all data', exact: true })
        .click();
      await advance(500);
      expect((await saved()).settings.focusMinutes).toBe(25);
      expect((await saved()).unknownField).toBeUndefined();
      await expect(page.getByRole('alert')).toHaveCount(0);
    },
  );

  await check('a second browser tab cannot overwrite the editing workspace', async () => {
    const second = await context.newPage();
    second.on('pageerror', (error) => errors.push(error.message));
    second.on('request', (request) => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin)
        outbound.push(request.url());
    });
    try {
      await second.goto(url);
      await expect(second.getByRole('alert')).toContainText('Another Focus tab owns');
      await second
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('button', { name: 'Preferences', exact: true })
        .click();
      await second.getByRole('button', { name: 'Dark', exact: true }).click();
      await expect(second.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect((await saved()).settings.theme).toBe('light');
      await second.getByRole('button', { name: 'Privacy & data', exact: true }).click();
      await expect(second.getByText('Temporary / read-only', { exact: true })).toBeVisible();
      await second.getByRole('button', { name: 'Delete all data', exact: true }).click();
      await second
        .getByRole('dialog')
        .getByRole('button', { name: 'Delete all data', exact: true })
        .click();
      await expect(second.locator('.error-banner')).toContainText('Could not clear local data');
      expect((await saved()).settings.theme).toBe('light');
    } finally {
      await second.close();
    }
  });
  await check('pagehide flushes immediate edits before the debounce timer runs', async () => {
    await nav('Overview');
    await page.getByRole('button', { name: 'Add intention', exact: true }).click();
    await page.getByLabel('Your intention', { exact: true }).fill('Saved during pagehide');
    await page.getByRole('button', { name: 'Add intention', exact: true }).last().click();
    // Functional time is still paused: the 300 ms autosave has not run.
    await page.reload();
    await expect(page.locator('.intention-row')).toContainText('Saved during pagehide');
    await page.getByRole('button', { name: 'Delete Saved during pagehide', exact: true }).click();
    await advance(500);
  });

  const names = [
    'Overview',
    'Focus room',
    'Your insights',
    'Your sensors',
    'Notifications',
    'Preferences',
  ];
  await check('all screens fit small web and native-minimum window sizes', async () => {
    for (const width of [390, 940, 1024, 1440]) {
      await page.setViewportSize({ width, height: width === 940 ? 680 : 900 });
      for (const name of names) {
        await nav(name);
        const dimensions = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scroll, `${name} at ${width}px`).toBeLessThanOrEqual(dimensions.width);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await nav('Overview');
    await advance(7000);
    await page.screenshot({ path: `${artifacts}/overview-mobile.png`, fullPage: true });
  });
  await check(
    'automated accessibility checks pass in both themes on all main screens',
    async () => {
      // Accessibility's async work runs against a fresh, real-clock context.
      // The functional scenarios above use a paused, explicitly advanced clock.
      await context.close();
      context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        locale: 'en-US',
        reducedMotion: 'reduce',
      });
      page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('request', (request) => {
        if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin)
          outbound.push(request.url());
      });
      await page.goto(url);
      await page.getByRole('heading', { name: 'Make space for good work.' }).waitFor();
      for (const theme of ['light', 'dark']) {
        await nav('Preferences');
        await page
          .getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
          .click();
        for (const name of names) {
          await nav(name);
          await audit(name);
          if (name === 'Preferences') {
            for (const tab of ['AI & companion', 'Privacy & data', 'About Focus']) {
              await page.getByRole('button', { name: tab, exact: true }).click();
              await audit(`Preferences / ${tab}`);
              if (tab === 'About Focus') {
                await page
                  .getByRole('button', { name: 'Open-source licenses', exact: true })
                  .click();
                await expect(page.getByRole('dialog').locator('pre')).toContainText(
                  'FOCUS — DEPENDENCY NOTICES',
                );
                await audit('Open-source licenses dialog');
                await page.keyboard.press('Escape');
              }
            }
          }
        }
        await nav('Overview');
        await page.getByRole('button', { name: 'Start focus', exact: true }).click();
        await audit('Start session dialog');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Let’s talk a little', exact: true }).click();
        await page.getByRole('textbox', { name: 'Message your companion' }).fill('I feel stuck');
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        await audit('Offline companion');
        await page.keyboard.press('Escape');
        await nav('Your sensors');
        await page.getByRole('button', { name: 'Try camera preview', exact: true }).click();
        await audit('Camera consent dialog');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Try input rhythm', exact: true }).click();
        await audit('Input consent dialog');
        await page.keyboard.press('Escape');
        await nav('Focus room');
        await page.getByRole('button', { name: 'Make room for rest' }).click();
        await audit('Voluntary break dialog');
        await page.getByRole('button', { name: 'Begin break', exact: true }).click();
        await page.getByRole('button', { name: 'A tiny garden game', exact: true }).click();
        await audit('Optional garden game');
        await page.getByRole('button', { name: 'Leave the garden', exact: true }).click();
        await page.getByRole('button', { name: 'End break', exact: true }).click();
      }
      await writeFile(`${artifacts}/accessibility.json`, JSON.stringify(audits, null, 2));
      const violations = audits.flatMap((audit) =>
        audit.violations.map((v) => ({
          theme: audit.theme,
          screen: audit.screen,
          id: v.id,
          nodes: v.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
        })),
      );
      expect(violations).toEqual([]);
    },
  );
  await nav('Preferences');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await nav('Overview');
  await check('no uncaught browser errors or third-party HTTP requests occurred', async () => {
    expect(errors).toEqual([]);
    expect(outbound).toEqual([]);
  });
  await writeFile(
    `${artifacts}/result.json`,
    JSON.stringify(
      { passed, errors, outbound, realCameraRequests: 0, nativeHardwareValidated: false },
      null,
      2,
    ),
  );
  console.log(
    `\n${passed} browser scenarios passed. Hardware/native WebViews are not covered by these tests.`,
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(
      `${artifacts}/failure.txt`,
      `${error.stack || error}\nBrowser errors: ${JSON.stringify(errors)}\n`,
    ).catch(() => {});
  }
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  await context?.close();
  await browser?.close();
  if (server)
    await new Promise((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
}
