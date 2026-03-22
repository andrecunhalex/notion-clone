---
name: Editor refactoring 2026-03-22
description: Major refactoring of the Notion-like editor for performance, lib-readiness, and future Yjs/Supabase integration
type: project
---

Editor refactored with these key changes:

1. **React.memo on Block** - Block no longer receives full `blocks` array. Gets `listNumber` and `isLastBlock` as pre-computed props. Custom memo comparator prevents unnecessary re-renders.

2. **innerHTML sync fix** - `isLocalEditRef` flag prevents overwriting DOM during active editing. Only syncs from external changes (undo/redo, paste, collaborative edits). Critical for future Yjs integration.

3. **RAF throttle** - useSelection mousemove, ImageBlock resize, and useTableBlock column resize all use requestAnimationFrame throttling.

4. **EditorDataSource.trackSelectedIds** - Replaced `as any` hack with proper `trackSelectedIds` method on the data source interface. Clean API for history tracking.

5. **EditorConfig** - New `config` prop on NotionEditor: `pageContentHeight`, `historyDebounceMs`, `fetchFonts`. Makes the editor configurable without forking.

6. **Font system decoupled** - FontLoader accepts optional `fetchFonts` prop. Falls back to `/api/fonts` if not provided. Gracefully degrades on fetch failure.

7. **Editor CSS isolated** - Editor-specific styles moved to `app/editor/editor.css`. `globals.css` just imports it.

8. **useBlockKeyboard extracted** - Keyboard handling extracted from Block.tsx into its own hook for maintainability.

9. **useFloatingToolbar consolidated** - 6 separate useLayoutEffect for submenu positioning merged into 1.

10. **JSON.stringify removed** from useTableBlock DOM sync — uses reference comparison instead.

**Why:** User wants the editor to be copy-paste reusable as a lib, lightweight for editing, and ready for Yjs+Supabase real-time collaboration.

**How to apply:** When making future changes, respect the EditorConfig pattern for new configurable values. Keep Block memo-friendly by not passing large changing objects as props.
