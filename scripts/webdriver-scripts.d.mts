// Types only; this external development harness is never bundled into the app.
export const nativeScripts: Readonly<
  Record<
    | 'text'
    | 'hasSelector'
    | 'hasButton'
    | 'clickButton'
    | 'reload'
    | 'requestClose'
    | 'diagnostics',
    string
  >
>;
