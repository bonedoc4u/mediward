import { ToDoItem } from '../types';

/** "2026-08-04" → "04-08" — pure string slicing, no Date parsing (see utils/dates.ts). */
export function shortDate(ymd: string): string {
  return ymd.slice(5).split('-').reverse().join('-');
}

/** What (if anything) to badge a still-open todo with, for the day being
 *  viewed. Never hides the item — only flags that it's not freshly ordered
 *  on this day (see types.ts ToDoItem.addedDate). A MISSING addedDate is
 *  itself meaningful once this code is live: every current creation path
 *  stamps it, so an open item with none can only predate this fix — badge
 *  those generically rather than showing nothing, since "no badge" was
 *  indistinguishable from "added today" and that's exactly the confusion
 *  this exists to fix. */
export function carryOverLabel(
  todo: Pick<ToDoItem, 'isDone' | 'addedDate'>,
  selectedDate: string,
): string | null {
  if (todo.isDone) return null;
  if (!todo.addedDate) return 'carried over';
  if (todo.addedDate === selectedDate) return null;
  return `since ${shortDate(todo.addedDate)}`;
}
