import { expect, it } from 'vitest';
import { emptyAiConnection, recentChatContext } from '../src/core/ai';
import type { ChatMessage } from '../src/core/types';

it('does not enable or discover a provider by default', () => {
  expect(emptyAiConnection()).toMatchObject({
    source: 'offline',
    connected: false,
    acknowledged: false,
    model: '',
    models: [],
  });
});
it('keeps a bounded recent conversation beginning with a user turn', () => {
  const messages: ChatMessage[] = Array.from({ length: 31 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i}`,
  }));
  const result = recentChatContext(messages);
  expect(result.length).toBeLessThanOrEqual(14);
  expect(result[0].role).toBe('user');
  expect(result.at(-1)?.content).toBe('Message 30');
});
it('budgets encoded bytes, not only English character counts', () => {
  const messages: ChatMessage[] = Array.from({ length: 14 }, (_, i) => ({
    role: i % 2 === 0 ? 'assistant' : 'user',
    content: '🌿'.repeat(750),
  }));
  const context = recentChatContext(messages);
  expect(
    context.reduce((sum, m) => sum + new TextEncoder().encode(m.content).length, 0),
  ).toBeLessThanOrEqual(14_000);
  expect(context.every((m) => m.content.length <= 1500)).toBe(true);
});
it('does not cut a surrogate pair at the IPC boundary', () => {
  const [message] = recentChatContext([{ role: 'user', content: `${'x'.repeat(1499)}🌿end` }]);
  expect(message.content).toBe('x'.repeat(1499));
});
