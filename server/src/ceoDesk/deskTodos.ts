/**
 * Claude's to-do list, from the calls that change it: TodoWrite sends the
 * whole list; TaskCreate and TaskUpdate (CLI 2.1.293 with
 * CLAUDE_CODE_ENABLE_TODO_TOOLS) add and change one item each. Input shapes:
 * sdk-tools.d.ts of the Agent SDK 0.3.292.
 */

import type { TodoItem } from '../../../core/src/catSession.js';

export const TODO_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate']);

const STATUSES = new Set<string>(['pending', 'in_progress', 'completed']);

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

function item(content: unknown, status: unknown, activeForm: unknown, id?: string): TodoItem[] {
  if (typeof content !== 'string' || !content.trim()) return [];
  const form = str(activeForm);
  return [
    {
      ...(id ? { id } : {}),
      content,
      status: STATUSES.has(status as string) ? (status as TodoItem['status']) : 'pending',
      ...(form ? { activeForm: form } : {}),
    },
  ];
}

/** The list after one successful call; `result` is the call's result text. */
export function nextTodos(
  list: TodoItem[],
  name: string,
  input: Record<string, unknown>,
  result: string,
): TodoItem[] {
  if (name === 'TodoWrite') {
    const todos = Array.isArray(input.todos) ? (input.todos as Record<string, unknown>[]) : [];
    return todos.flatMap((t) => item(t.content, t.status, t.activeForm));
  }
  if (name === 'TaskCreate') {
    // "Task #1 created successfully: Read the file"
    const id = /#(\w+)/.exec(result)?.[1];
    return [...list, ...item(input.subject, 'pending', input.activeForm, id)];
  }
  const id = str(input.taskId);
  if (name !== 'TaskUpdate' || !id) return list;
  if (input.status === 'deleted') return list.filter((t) => t.id !== id);
  return list.map((t) =>
    t.id === id
      ? (item(
          input.subject ?? t.content,
          input.status ?? t.status,
          input.activeForm ?? t.activeForm,
          id,
        )[0] ?? t)
      : t,
  );
}
