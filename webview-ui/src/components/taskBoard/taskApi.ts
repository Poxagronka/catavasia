import type { TaskDetail, TaskSummary } from '../../../../core/src/tasks.js';
import { sessionToken } from '../../sessionToken.js';

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      message = ((await res.json()) as { error?: string; message?: string }).error ?? message;
    } catch {
      /* body was not JSON */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function fetchTask(id: string): Promise<TaskDetail> {
  return readJson(await fetch(`/api/tasks/${encodeURIComponent(id)}`));
}

const tokenQuery = () => (sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '');

/** Resume an interrupted team task, or cancel a running or interrupted one (token-gated). */
export async function taskAction(id: string, action: 'resume' | 'cancel'): Promise<TaskSummary> {
  const url = `/api/tasks/${encodeURIComponent(id)}/${action}${tokenQuery()}`;
  return readJson(await fetch(url, { method: 'POST' }));
}
