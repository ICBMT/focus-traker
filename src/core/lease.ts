// A Web Lock is held for the lifetime of one editing document. No heartbeat,
// task text, identifiers, or raw input is exchanged between tabs.
export interface LeaseResult {
  writable: boolean;
  warning?: string;
}
const BUSY =
  'Another Focus tab owns this workspace. This tab is temporary/read-only. Close the other tab, then reload this one to edit saved data.';
const UNAVAILABLE =
  'Exclusive browser storage is unavailable. This workspace is temporary/read-only; use a current browser in a secure context or the desktop app.';

export class BrowserWorkspaceLease {
  private acquisition: Promise<LeaseResult> | null = null;
  private releaseLock: (() => void) | null = null;
  private owned = false;
  private released = false;

  get writable(): boolean {
    return this.owned;
  }

  acquire(manager: LockManager | undefined): Promise<LeaseResult> {
    if (this.acquisition) return this.acquisition;
    this.acquisition = new Promise<LeaseResult>((resolve) => {
      if (!manager?.request || this.released) {
        resolve({ writable: false, warning: UNAVAILABLE });
        return;
      }
      void manager
        .request(
          'focus.workspace.v1.writer',
          { mode: 'exclusive', ifAvailable: true },
          async (lock) => {
            if (!lock || this.released) {
              resolve({ writable: false, warning: BUSY });
              return;
            }
            this.owned = true;
            resolve({ writable: true });
            try {
              await new Promise<void>((release) => {
                this.releaseLock = release;
              });
            } finally {
              this.owned = false;
              this.releaseLock = null;
            }
          },
        )
        .catch(() => {
          this.owned = false;
          resolve({ writable: false, warning: UNAVAILABLE });
        });
    });
    return this.acquisition;
  }

  release(): void {
    this.released = true;
    // The caller must synchronously flush BEFORE release. Do not depend on
    // ordering between separate pagehide listeners/microtask checkpoints.
    this.owned = false;
    this.releaseLock?.();
  }
}
