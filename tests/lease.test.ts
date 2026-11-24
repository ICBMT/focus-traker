import { describe, expect, it, vi } from 'vitest';
import { BrowserWorkspaceLease } from '../src/core/lease';

function locks() {
  let held = false;
  const request = vi.fn(async (_name, _options, callback) => {
    if (held) return callback(null);
    held = true;
    try {
      return await callback({ name: 'focus.workspace.v1.writer', mode: 'exclusive' });
    } finally {
      held = false;
    }
  });
  return { manager: { request } as unknown as LockManager, request };
}

describe('exclusive browser workspace ownership', () => {
  it('allows one writer and returns the same acquisition to duplicate initialization', async () => {
    const { manager, request } = locks();
    const first = new BrowserWorkspaceLease();
    const acquisition = first.acquire(manager);
    expect(first.acquire(manager)).toBe(acquisition);
    expect(await acquisition).toEqual({ writable: true });
    expect(request).toHaveBeenCalledOnce();
    expect(first.writable).toBe(true);
    const second = new BrowserWorkspaceLease();
    expect(await second.acquire(manager)).toMatchObject({ writable: false });
    expect(second.writable).toBe(false);
    first.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(first.writable).toBe(false);
    const third = new BrowserWorkspaceLease();
    expect(await third.acquire(manager)).toEqual({ writable: true });
    third.release();
  });
  it('fails closed rather than inventing an unsafe local-storage heartbeat fallback', async () => {
    const lease = new BrowserWorkspaceLease();
    expect(await lease.acquire(undefined)).toMatchObject({ writable: false });
    expect(lease.writable).toBe(false);
  });
  it('does not acquire a lock after the document has already left', async () => {
    const { manager, request } = locks();
    const lease = new BrowserWorkspaceLease();
    lease.release();
    expect(await lease.acquire(manager)).toMatchObject({ writable: false });
    expect(request).not.toHaveBeenCalled();
  });
  it('handles permission/security failures without permitting writes', async () => {
    const lease = new BrowserWorkspaceLease();
    const manager = {
      request: vi.fn().mockRejectedValue(new Error('Denied')),
    } as unknown as LockManager;
    expect(await lease.acquire(manager)).toMatchObject({ writable: false });
    expect(lease.writable).toBe(false);
  });
});
