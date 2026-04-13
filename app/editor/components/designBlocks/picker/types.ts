// Local types shared by the picker subcomponents.

import type { LibraryTemplate, LibraryClause } from '../../../designLibrary';

export type PickerResult =
  | { kind: 'template'; template: LibraryTemplate }
  | { kind: 'clause'; clause: LibraryClause };

export type Tab = 'blocks' | 'clauses';

/** Right-pane view state — clause editing is always inline; only template
 *  create/edit uses a dedicated view. */
export type View = { mode: 'list' } | { mode: 'edit-template'; template?: LibraryTemplate };
