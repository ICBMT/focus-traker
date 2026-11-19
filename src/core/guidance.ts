export function offlineGuidance(message: string, task?: string): string {
  const text = message.toLowerCase();
  const intention = task?.trim() ? `For “${task.trim().slice(0, 160)},” ` : '';
  if (/tired|rest|break|exhaust/.test(text))
    return 'A pause is a valid next step. Look away from the screen, relax your shoulders, and get some water if you would like. You can choose a five-minute break from the workspace—no need to earn it.';
  if (/stuck|overwhelm|hard|bored|difficult/.test(text))
    return `${intention}make the next step almost too small: write one rough sentence, list one open question, or try one small change. Give it ten unhurried minutes. Would a smaller step or a short reset feel better?`;
  if (/zone|flow|focus|distract/.test(text))
    return 'Keep one intention in view and put the next unrelated thought on your list for later. Focus protection keeps this app quiet; it does not block other apps. Reading and thinking count as work, too.';
  if (/start|plan|begin|next/.test(text))
    return `${intention}choose one visible outcome you can move toward in a single session. Write down the smallest first action, choose a comfortable duration, and start before it feels perfectly planned.`;
  return 'You do not have to solve everything at once. What is one small, useful thing you would like to move forward? I can offer a starting step, a stuck-work reset, or a reminder to rest. These are offline prompts, not an AI assessment.';
}

export interface SampleNotice {
  title: string;
  body: string;
  priority: 'urgent' | 'normal' | 'low';
}
export interface RuleDecision {
  action: 'allow' | 'defer';
  reason: string;
  rule: string;
}
export function evaluateNotice(notice: SampleNotice, task: string, protect: boolean): RuleDecision {
  if (notice.priority === 'urgent')
    return {
      action: 'allow',
      rule: 'Explicit urgent rule',
      reason:
        'The simulator marks this source as user-approved urgent. It bypasses batching and AI.',
    };
  if (!protect)
    return {
      action: 'allow',
      rule: 'Focus protection is off',
      reason: 'This app is not batching simulator items.',
    };
  if (notice.priority === 'low')
    return {
      action: 'defer',
      rule: 'Explicit low-priority rule',
      reason: 'You marked this example as batch-only. The original remains at its source.',
    };
  const terms = task
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 4);
  if (terms.some((term) => `${notice.title} ${notice.body}`.toLowerCase().includes(term)))
    return {
      action: 'allow',
      rule: 'Task term matched',
      reason:
        'This example contains a term in your chosen task. A lexical match is not semantic certainty.',
    };
  return {
    action: 'allow',
    rule: 'Conservative fallback',
    reason:
      'Relevance is uncertain. A potentially important item is allowed rather than silently hidden.',
  };
}
