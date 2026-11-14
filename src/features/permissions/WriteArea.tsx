import React from 'react';
import { type Permission } from '../../../utils/permissions';
import { useCan } from './useCan';
import ViewOnlyNote from './ViewOnlyNote';

interface Props {
  /** The permission needed to change what is inside. */
  permission: Permission;
  /** Hide the "View only" line (use when the screen already shows one). */
  quiet?: boolean;
  /**
   * Also ignore taps on everything inside. Needed when the area has tappable
   * rows that are not real buttons. Do not use it around a part that scrolls
   * sideways or holds links: those would stop working too.
   */
  blockTaps?: boolean;
  /** Layout classes for the disabled wrapper, when the children need the parent's spacing. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Wraps the controls of a screen that only some roles may change.
 *
 * With the permission it renders its children untouched. Without it, every
 * button, input and picker inside is disabled (a disabled <fieldset> does
 * that for all form controls in it) and a "View only" line says why.
 * The save functions and the database refuse the change too; this only keeps
 * a control from looking usable.
 */
const WriteArea: React.FC<Props> = ({ permission, quiet = false, blockTaps = false, className = '', children }) => {
  const allowed = useCan(permission);
  if (allowed) return <>{children}</>;
  return (
    <>
      {!quiet && <ViewOnlyNote />}
      <fieldset disabled className={`m-0 min-w-0 border-0 p-0 ${blockTaps ? 'pointer-events-none' : ''} ${className}`}>
        {children}
      </fieldset>
    </>
  );
};

export default WriteArea;
