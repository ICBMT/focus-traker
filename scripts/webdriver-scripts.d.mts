// Types only; this external development harness is never bundled into the app.
export const nativeScripts: Readonly<
  Record<
    | 'focusSelector'
    | 'mainOnlyDenied'
    | 'text'
    | 'hasSelector'
    | 'hasButton'
    | 'clickButton'
    | 'reload'
    | 'timeOrigin'
    | 'reloadReady'
    | 'requestClose'
    | 'diagnostics',
    string
  >
>;
