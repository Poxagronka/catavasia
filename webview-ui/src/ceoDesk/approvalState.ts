/** Pure helpers of the approval and question cards (ApprovalCard, QuestionCard). */

import type { CeoQuestion } from '../../../core/src/ceoDesk.js';

/** "14:32": when an unanswered card counts as No. */
export function deadline(expiresAt: number): string {
  return new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** What the user chose for one question: the picked option labels and the "Other" text. */
export interface QuestionPick {
  picked: string[];
  other: string;
}

/**
 * The answers Claude's AskUserQuestion takes (question text -> answer; several
 * picks comma-separated, the "Other" text last), or null while a question has none.
 */
export function questionAnswers(
  questions: CeoQuestion[],
  picks: QuestionPick[],
): Record<string, string> | null {
  const answers: Record<string, string> = {};
  for (const [n, q] of questions.entries()) {
    const pick = picks[n];
    const parts = [...pick.picked, pick.other.trim()].filter(Boolean);
    if (!parts.length) return null;
    answers[q.question] = parts.join(', ');
  }
  return answers;
}

/** The new pick after a click on `label`: one choice, or a toggle in a multi-select. */
export function togglePick(q: CeoQuestion, pick: QuestionPick, label: string): QuestionPick {
  if (!q.multiSelect) return { picked: [label], other: '' };
  const picked = pick.picked.includes(label)
    ? pick.picked.filter((l) => l !== label)
    : q.options.map((o) => o.label).filter((l) => l === label || pick.picked.includes(l));
  return { ...pick, picked };
}
