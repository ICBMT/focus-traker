import type { ChatMessage, OllamaModel } from './types';
export interface AiConnection {
  port: number;
  model: string;
  models: OllamaModel[];
  connected: boolean;
  acknowledged: boolean;
  source: 'offline' | 'ollama';
}
export const emptyAiConnection = (): AiConnection => ({
  port: 11434,
  model: '',
  models: [],
  connected: false,
  acknowledged: false,
  source: 'offline',
});

// Keep UI history useful without exceeding the Rust IPC/context bounds. Never
// split a surrogate pair, and budget bytes as well as JS UTF-16 code units.
export function recentChatContext(messages: ChatMessage[]): ChatMessage[] {
  const encoder = new TextEncoder();
  const recent: ChatMessage[] = [];
  let bytes = 0;
  for (const message of [...messages].reverse()) {
    let content = message.content.slice(0, 1500);
    if (/[\uD800-\uDBFF]$/.test(content)) content = content.slice(0, -1);
    const size = encoder.encode(content).length;
    if (recent.length >= 14 || bytes + size > 14_000) break;
    recent.unshift({ role: message.role, content });
    bytes += size;
  }
  if (recent[0]?.role === 'assistant') recent.shift();
  return recent;
}
