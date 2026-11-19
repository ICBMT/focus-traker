import { describe, expect, it } from 'vitest';
import { evaluateNotice, offlineGuidance } from '../src/core/guidance';
import type { SampleNotice } from '../src/core/guidance';

const notice: SampleNotice = {
  title: 'A message',
  body: 'Something to read later',
  priority: 'normal',
};
describe('explainable conservative notification simulation', () => {
  it('always bypasses batching for an explicitly urgent example', () => {
    expect(evaluateNotice({ ...notice, priority: 'urgent' }, '', true)).toMatchObject({
      action: 'allow',
      rule: 'Explicit urgent rule',
    });
  });
  it('lets everything through when protection is off', () => {
    expect(evaluateNotice({ ...notice, priority: 'low' }, '', false).action).toBe('allow');
  });
  it('defers only the user-explicit low-priority rule', () => {
    expect(evaluateNotice({ ...notice, priority: 'low' }, '', true)).toMatchObject({
      action: 'defer',
      rule: 'Explicit low-priority rule',
    });
  });
  it('explains a lexical task match without claiming semantic certainty', () => {
    expect(
      evaluateNotice({ ...notice, body: 'A proposal revision is ready.' }, 'Write proposal', true),
    ).toMatchObject({ action: 'allow', rule: 'Task term matched' });
  });
  it('allows uncertain relevance instead of silently hiding it', () => {
    expect(evaluateNotice(notice, 'Write proposal', true)).toMatchObject({
      action: 'allow',
      rule: 'Conservative fallback',
    });
  });
});

it('offers canned supportive guidance without mental-state or OS-control claims', () => {
  expect(offlineGuidance('Help me start', 'A paragraph')).toContain('A paragraph');
  expect(offlineGuidance('I’m tired')).toContain('A pause is a valid next step');
  expect(offlineGuidance('I feel bored')).toContain('next step almost too small');
  expect(offlineGuidance('Hello')).toContain('offline prompts, not an AI assessment');
  expect(offlineGuidance('I want to focus')).toContain('does not block other apps');
});
