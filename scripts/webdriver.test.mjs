import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFunction, createContext } from 'node:vm';
import { nativeScripts } from './webdriver-scripts.mjs';

// Compile the exact programs sent over WebDriver, not a reimplementation. This
// catches quotes lost by the outer JS parser before a native CI build starts.
test('all native WebDriver programs survive JSON transport and compile', () => {
  for (const [name, script] of Object.entries(nativeScripts)) {
    const transported = JSON.parse(JSON.stringify({ script, args: [] }));
    assert.doesNotThrow(() => compileFunction(transported.script), name);
  }
});

test('native selectors and labels are data, including quotes and unicode', () => {
  const clicked = [];
  const selectors = [];
  const label = `A "quoted" label, apostrophe's and a breath — \u2615`;
  const buttons = [
    { textContent: label, disabled: true, click: () => clicked.push('wrong') },
    { textContent: ` ${label} `, disabled: false, click: () => clicked.push('right') },
  ];
  const root = { textContent: 'native window', querySelectorAll: () => buttons };
  const document = {
    ...root,
    querySelector(selector) {
      selectors.push(selector);
      return selector === '.not-yet-mounted' ? null : root;
    },
  };
  const context = createContext({ document });
  const execute = (name, args = []) => {
    const transported = JSON.parse(JSON.stringify({ script: nativeScripts[name], args }));
    return compileFunction(transported.script, [], { parsingContext: context })(
      ...transported.args,
    );
  };
  for (const selector of [
    'button[aria-label="Pause session"]',
    'button[aria-label="Resume session"]',
    'button[aria-label="End break"]',
  ]) {
    assert.equal(execute('hasSelector', [selector]), true);
    assert.equal(selectors.at(-1), selector);
  }
  assert.equal(execute('hasButton', [label, '.not-yet-mounted']), false);
  assert.equal(execute('text', ['.runtime-badge']), 'native window');
  assert.equal(execute('hasButton', [label, '.modal']), true);
  execute('clickButton', [label, '.modal']);
  assert.deepEqual(clicked, ['right']);
  assert.equal(selectors.at(-1), '.modal');
});

test('native reload and close use the normal window lifecycle', () => {
  const calls = [];
  const window = {
    location: { reload: () => calls.push('reload') },
    __TAURI_INTERNALS__: {
      invoke: (command, args) => calls.push([command, args.label]),
    },
  };
  const context = createContext({ window });
  for (const name of ['reload', 'requestClose'])
    assert.equal(compileFunction(nativeScripts[name], [], { parsingContext: context })(), true);
  assert.deepEqual(calls, ['reload', ['plugin:window|close', 'main']]);
});
