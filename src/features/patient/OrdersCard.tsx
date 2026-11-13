/**
 * OrdersCard — open orders first, each with how long it has been open; done
 * orders after them, struck through. Read-only: orders are ticked in Round
 * Mode and Daily Rounds.
 */
import React from 'react';
import { CheckSquare } from 'lucide-react';
import { ToDoItem } from '../../../types';

interface Props {
  todos: readonly ToDoItem[];
  /** Today as YYYY-MM-DD (device time zone). */
  today: string;
}

/**
 * "today", "open 2 d", or "" when the order has no known start date
 * (orders created by older app versions were not date-stamped).
 */
export function openForLabel(addedDate: string | undefined, today: string): string {
  if (!addedDate || !/^\d{4}-\d{2}-\d{2}$/.test(addedDate)) return '';
  const [y, m, d] = addedDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86_400_000);
  if (days <= 0) return 'today';
  return `open ${days} d`;
}

const OrdersCard: React.FC<Props> = ({ todos, today }) => {
  const named = todos.filter(t => t.task?.trim());
  if (named.length === 0) return null;
  const open = named.filter(t => !t.isDone);
  const done = named.filter(t => t.isDone);

  return (
    <section aria-label="Orders" className="bg-surface-card rounded-2xl shadow-sm border border-line p-4 mb-3">
      <h3 className="font-bold text-ink flex items-center gap-2 mb-3 text-sm">
        <CheckSquare className="w-4 h-4 text-accent-fg" aria-hidden="true" /> Orders · {open.length} open
      </h3>
      <ul className="space-y-1.5">
        {open.map(t => {
          const age = openForLabel(t.addedDate, today);
          const overdue = age.startsWith('open');
          return (
            <li key={t.id} className="flex items-center gap-2 min-h-11 px-3 rounded-control border border-line bg-surface">
              <span className="w-2 h-2 rounded-full bg-vital-warning shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0 text-sm text-ink break-words">{t.task}</span>
              {age && (
                <span className={`shrink-0 text-xs font-bold ${overdue ? 'text-vital-warning-fg' : 'text-ink-muted'}`}>{age}</span>
              )}
            </li>
          );
        })}
        {done.map(t => (
          <li key={t.id} className="flex items-center gap-2 min-h-11 px-3 rounded-control border border-line bg-surface">
            <span className="w-2 h-2 rounded-full bg-vital-normal shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 text-sm text-ink-muted line-through break-words">{t.task}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default OrdersCard;
