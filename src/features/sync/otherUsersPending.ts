/**
 * Wording for "someone else's unsent changes are on this phone" (audit DATA-05).
 * Kept apart from the component so the text can be tested on its own.
 */
export function otherUsersPendingMessage(count: number, names: string[]): string {
  const who = names.length > 0 ? names.join(', ') : 'another user';
  const many = count > 1;
  return `${count} unsent change${many ? 's' : ''} made by ${who} ${many ? 'are' : 'is'} stored on this phone. ` +
    `${many ? 'They' : 'It'} will be sent when ${who} signs in here again.`;
}
