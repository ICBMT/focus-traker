// Fixed JavaScript programs for the external native WebDriver harness. User
// labels/selectors travel in W3C args, never by string interpolation. These are
// development-only files, not a production app automation bridge.
export const nativeScripts = Object.freeze({
  text: 'return document.querySelector(arguments[0])?.textContent || ""',
  hasSelector: 'return !!document.querySelector(arguments[0])',
  hasButton:
    'const root = arguments[1] ? document.querySelector(arguments[1]) : document; return !!root && [...root.querySelectorAll("button")].some(b => b.textContent.trim() === arguments[0] && !b.disabled);',
  clickButton:
    'const root = arguments[1] ? document.querySelector(arguments[1]) : document; [...root.querySelectorAll("button")].find(b => b.textContent.trim() === arguments[0] && !b.disabled).click();',
  reload: 'window.location.reload(); return true;',
  diagnostics:
    'return {body:document.body.innerText.slice(0,6000),buttons:[...document.querySelectorAll("button")].map(b => ({label:b.getAttribute("aria-label") || b.textContent.trim(),disabled:b.disabled})),fields:[...document.querySelectorAll("input")].map(i => ({id:i.id,value:i.value}))};',
  requestClose:
    'window.__TAURI_INTERNALS__.invoke("plugin:window|close", {label:"main"}); return true;',
});
