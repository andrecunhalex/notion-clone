# NotionEditor API Reference

> Comprehensive API documentation for AI agents integrating with the NotionEditor component.
> Generated 2026-04-01.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [NotionEditorProps](#notioneditorprops)
3. [EditorConfig](#editorconfig)
4. [PageConfig](#pageconfig)
5. [SectionNavConfig](#sectionnavconfig)
6. [SectionNavButtonTemplate](#sectionnavbuttontemplate)
7. [BlockData](#blockdata)
8. [BlockType](#blocktype)
9. [Supporting Data Types](#supporting-data-types)
10. [EditorDataSourceInterface](#editordatasourceinterface)
11. [EditorDataSource (Internal)](#editordatasource-internal)
12. [Design Block Template System](#design-block-template-system)
13. [Section Navigation System](#section-navigation-system)
14. [Usage Examples](#usage-examples)

---

## Quick Start

```tsx
import { NotionEditor } from './app/editor/NotionEditor';

// Minimal usage — renders an empty editor in paginated mode
<NotionEditor />

// With initial content and change handler
<NotionEditor
  initialBlocks={[
    { id: '1', type: 'h1', content: 'Hello World' },
    { id: '2', type: 'text', content: 'Start writing...' },
  ]}
  onChange={(blocks) => saveToDatabase(blocks)}
/>
```

---

## NotionEditorProps

Top-level props for the `<NotionEditor>` component.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialBlocks` | `BlockData[]` | `[{ id: 'initial-block', type: 'text', content: '' }]` | Initial block content. Ignored when `dataSource` is provided. |
| `onChange` | `(blocks: BlockData[]) => void` | `undefined` | Callback fired on every block mutation. Receives the full blocks array. |
| `defaultViewMode` | `ViewMode` | `'paginated'` | Initial view mode. `'continuous'` renders a single scrollable document; `'paginated'` renders A4-style pages. |
| `title` | `string` | `'MiniNotion'` | Title shown in the toolbar. |
| `dataSource` | `EditorDataSourceInterface` | `undefined` | Pluggable data source (e.g. Yjs-backed). When provided, `initialBlocks` is ignored and the editor reads/writes through this interface. |
| `config` | `EditorConfig` | `{}` | Editor configuration object. Controls page dimensions, zoom, fonts, image upload, section nav, and more. |
| `onBlockFocus` | `(blockId: string \| null) => void` | `undefined` | Called when the user focuses a block. Useful for broadcasting cursor position in collaboration mode. |
| `remoteUsers` | `RemoteUser[]` | `undefined` | Array of remote collaborator presence objects. Displayed in the toolbar. |
| `syncStatus` | `'disconnected' \| 'connecting' \| 'connected' \| 'synced'` | `undefined` | Sync status indicator shown in the toolbar for collaboration mode. |

### RemoteUser shape

```ts
{
  id: string;
  name: string;
  color: string;
  cursor?: { blockId: string } | null;
}
```

---

## EditorConfig

Passed via `config` prop. All fields are optional.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | `PageConfig` | See PageConfig defaults | Page dimensions and padding for paginated mode. |
| `pageContentHeight` | `number` | Auto-calculated from `page` | Override the usable content height per page (px). Normally derived as `page.height - paddingTop - paddingBottom`. |
| `historyDebounceMs` | `number` | `500` | Debounce window for undo/redo history snapshots (ms). |
| `fetchFonts` | `() => Promise<FontFamily[]>` | Built-in `/api/fonts` call | Custom font fetcher. Replaces the default API call. Return an array of `FontFamily` objects. |
| `uploadImage` | `(file: File) => Promise<string \| null>` | `undefined` | Custom image uploader. Receives a `File`, returns a URL string. When not provided, images are stored inline as base64 data URIs. |
| `defaultZoom` | `number` | `1` | Initial zoom level for paginated mode. Range: `0.1` to `3`. |
| `sectionNav` | `SectionNavConfig` | `undefined` | Configuration for the section navigation system (table-of-contents buttons rendered on pages). |

---

## PageConfig

Controls page dimensions and padding in paginated mode. Defaults match A4 at 96 DPI.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `width` | `number` | `794` | Page width in px (A4 = 794px at 96dpi). |
| `height` | `number` | `1123` | Page height in px (A4 = 1123px at 96dpi). |
| `paddingTop` | `number` | `56` | Top padding in px (~15mm). |
| `paddingRight` | `number` | `75` | Right padding in px (~20mm). |
| `paddingBottom` | `number` | `56` | Bottom padding in px (~15mm). |
| `paddingLeft` | `number` | `75` | Left padding in px (~20mm). |

---

## SectionNavConfig

Controls the section navigation bar rendered on pages. The nav bar shows buttons for each heading-level block in the document.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `position` | `SectionNavPosition` | `'header'` | Where on the page the nav is rendered. One of `'header'`, `'footer'`, `'left'`, `'right'`. |
| `pages` | `SectionNavPageFilter` | `'all'` | Which pages show the nav. See filter options below. |
| `maxButtons` | `number` | `undefined` (unlimited) | Maximum visible buttons before collapsing. When exceeded, the nav collapses to a single "Sumario" button that scrolls to an auto-generated TOC page. |
| `maxLabelLength` | `number` | `16` | Maximum characters for button labels before truncation with `...`. |
| `activeColor` | `string` | `'#7c3aed'` (purple) | Active button color for the default pill buttons. Ignored when `buttonTemplate` is set. |
| `buttonTemplate` | `SectionNavButtonTemplate` | `undefined` | Custom HTML button template. Overrides the default pill buttons entirely. |

### SectionNavPosition

```ts
type SectionNavPosition = 'header' | 'footer' | 'left' | 'right';
```

- `'header'` -- rendered above the page content
- `'footer'` -- rendered below the page content
- `'left'` / `'right'` -- rendered as a vertical sidebar alongside the page content

### SectionNavPageFilter

```ts
type SectionNavPageFilter =
  | 'all'            // show on every page
  | 'none'           // never show
  | number[]         // show on specific page indices (0-based)
  | ((pageIndex: number, totalPages: number) => boolean);  // custom filter function
```

---

## SectionNavButtonTemplate

Defines fully custom HTML for section nav buttons. Active and inactive states have **separate HTML templates** -- they can be completely different designs, not just color swaps.

| Field | Type | Description |
|-------|------|-------------|
| `activeHtml` | `string` | HTML rendered when the heading IS on the current page. |
| `inactiveHtml` | `string` | HTML rendered when the heading is NOT on the current page. |

### Template Placeholders

Both `activeHtml` and `inactiveHtml` support these placeholders:

| Placeholder | Description |
|-------------|-------------|
| `{{label}}` | Button label (custom label if set, otherwise truncated original text). |
| `{{number}}` | Auto-number string (e.g. `"1"`, `"1.1"`, `"2.3"`). |
| `{{title}}` | Original full heading text (untruncated). |

Templates use pure HTML + Tailwind CSS classes and are fully serializable (safe to store in a database).

```ts
// Example
{
  activeHtml: '<div class="bg-purple-600 text-white rounded-full px-3 py-1 text-xs font-bold">{{label}}</div>',
  inactiveHtml: '<div class="bg-gray-100 text-gray-400 rounded-full px-3 py-1 text-xs border border-gray-200">{{label}}</div>',
}
```

---

## BlockData

The core data structure representing a single block in the document.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` | Yes | -- | Unique identifier for the block. |
| `type` | `BlockType` | Yes | -- | The block type. Determines rendering behavior. |
| `content` | `string` | Yes | -- | HTML content of the block. For non-text blocks (divider, image, design_block), this is typically `''`. |
| `indent` | `number` | No | `undefined` | Indentation level (0-based). Used for nested lists. |
| `align` | `TextAlign` | No | `undefined` | Text alignment. One of `'left'`, `'center'`, `'right'`, `'justify'`. |
| `fullWidth` | `boolean` | No | `undefined` | When `true`, the block ignores page padding and stretches edge-to-edge. |
| `tableData` | `TableData` | No | `undefined` | Required when `type === 'table'`. Contains rows, column widths, and header config. |
| `imageData` | `ImageData` | No | `undefined` | Required when `type === 'image'`. Contains src, width, alignment, and caption. |
| `designBlockData` | `DesignBlockData` | No | `undefined` | Required when `type === 'design_block'`. Contains template ID and editable values. |

---

## BlockType

```ts
type BlockType =
  | 'text'           // Plain paragraph
  | 'h1'             // Heading level 1
  | 'h2'             // Heading level 2
  | 'h3'             // Heading level 3
  | 'divider'        // Horizontal rule
  | 'bullet_list'    // Unordered list item
  | 'numbered_list'  // Ordered list item (auto-numbered)
  | 'table'          // Table block (requires tableData)
  | 'image'          // Image block (requires imageData)
  | 'design_block';  // Design block from template registry (requires designBlockData)
```

---

## Supporting Data Types

### ViewMode

```ts
type ViewMode = 'continuous' | 'paginated';
```

### TextAlign

```ts
type TextAlign = 'left' | 'center' | 'right' | 'justify';
```

### ImageAlignment

```ts
type ImageAlignment = 'left' | 'center' | 'right';
```

### ImageData

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `src` | `string` | Yes | Image URL or base64 data URI. Empty string triggers the upload UI. |
| `width` | `number` | Yes | Width as percentage of container (10--100). |
| `alignment` | `ImageAlignment` | Yes | Horizontal alignment within the block. |
| `caption` | `string` | No | Optional caption text displayed below the image. |

### TableData

| Field | Type | Description |
|-------|------|-------------|
| `rows` | `TableCellData[][]` | 2D array of cell data. Outer array = rows, inner array = columns. |
| `columnWidths` | `number[]` | Width of each column in px. |
| `hasHeaderRow` | `boolean` | Whether the first row is styled as a header. |

### TableCellData

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `string` | Yes | HTML content of the cell. |
| `bgColor` | `string` | No | Background color (CSS value). |
| `textColor` | `string` | No | Text color (CSS value). |

### DesignBlockData

| Field | Type | Description |
|-------|------|-------------|
| `templateId` | `string` | ID of the design block template (must match a registered template). |
| `values` | `Record<string, string>` | Key-value map of editable/swappable zone contents. Keys correspond to `data-editable` and `data-swappable` attribute values in the template HTML. |

---

## EditorDataSourceInterface

The pluggable data source interface. Implement this to replace the built-in local state with a custom backend (e.g. Yjs + Supabase for real-time collaboration).

Defined in `types/index.ts` as `EditorDataSourceInterface` and used internally as `EditorDataSource` (with guaranteed `meta` and `setMeta`).

| Field | Type | Description |
|-------|------|-------------|
| `blocks` | `BlockData[]` | Current blocks array. The editor reads from this reactively. |
| `setBlocks` | `(blocks: BlockData[]) => void` | Replace the entire blocks array. Called on every mutation. |
| `undo` | `() => string[]` | Undo the last operation. Returns an array of block IDs that were selected at the time of the undone snapshot (for selection restoration). |
| `redo` | `() => string[]` | Redo the last undone operation. Returns selected block IDs. |
| `canUndo` | `boolean` | Whether undo is available. |
| `canRedo` | `boolean` | Whether redo is available. |
| `trackSelectedIds` | `(ids: string[]) => void` | Optional. Called before each `setBlocks` with the currently selected block IDs, so that undo/redo can restore selection state. |
| `meta` | `Record<string, unknown>` | Optional. Document-level metadata (e.g. `documentFont`, `sectionNav` metadata). |
| `setMeta` | `(updates: Record<string, unknown>) => void` | Optional. Merge updates into document metadata. |

### Key metadata keys used by the editor

| Key | Type | Description |
|-----|------|-------------|
| `documentFont` | `string` | The font family applied to the entire document. |
| `sectionNav` | `SectionNavMeta` | Section navigation metadata (custom labels and hidden sections). |

### SectionNavMeta

```ts
interface SectionNavMeta {
  labels?: Record<string, string>;  // blockId -> custom label
  hidden?: string[];                // blockIds hidden from the nav bar
}
```

---

## EditorDataSource (Internal)

The internal interface used after the editor normalizes the external data source. Differs from `EditorDataSourceInterface` in that `meta` and `setMeta` are guaranteed to exist.

```ts
interface EditorDataSource {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
  undo: () => string[];
  redo: () => string[];
  canUndo: boolean;
  canRedo: boolean;
  trackSelectedIds?: (ids: string[]) => void;
  meta: DocumentMeta;             // guaranteed (defaults to {})
  setMeta: (updates: Partial<DocumentMeta>) => void;  // guaranteed (defaults to no-op)
}
```

The editor wraps external data sources to fill in missing `meta`/`setMeta` with safe defaults.

### useLocalDataSource

The built-in local data source hook. Used automatically when no `dataSource` prop is provided.

```ts
function useLocalDataSource(
  initialBlocks: BlockData[],
  debounceMs?: number,  // history debounce (default: 500)
): EditorDataSource;
```

This stores blocks + metadata in React state and provides undo/redo via a custom `useHistory` hook.

---

## Design Block Template System

Design blocks are reusable, richly styled block templates built with HTML + Tailwind. They are rendered from a central registry and support inline editing.

### DesignBlockTemplate

Defined in `components/designBlocks/registry.ts`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique template identifier. Referenced by `DesignBlockData.templateId`. |
| `name` | `string` | Yes | Human-readable name shown in the slash menu. |
| `html` | `string` | Yes | HTML + Tailwind template string. Must include `data-editable` and/or `data-swappable` attributes on interactive elements. |
| `defaults` | `Record<string, string>` | Yes | Default values for each editable/swappable zone. Keys must match the attribute values in the HTML. |
| `autonumber` | `'heading' \| 'subheading'` | No | When set, the block receives auto-computed numbering based on its position in the document. Also makes it participate in the section navigation system. |

### HTML Attribute System

| Attribute | Purpose |
|-----------|---------|
| `data-editable="key"` | Makes the element a contentEditable text zone. The `key` maps to `DesignBlockData.values[key]`. |
| `data-swappable="key"` | Makes the element clickable to swap its image/icon. The `key` maps to `DesignBlockData.values[key]`. Typically used on `<img>` elements. |
| `data-autonumber` | Placeholder element whose text content is replaced with the auto-computed number (e.g. `"1"`, `"2.1"`). Only works when `autonumber` is set on the template. |

### Built-in Templates

| ID | Name | Autonumber | Editable Zones | Swappable Zones |
|----|------|------------|-----------------|-----------------|
| `purple-card` | Card com Icone | -- | `body` | `icon` |
| `attention-callout` | Callout Atencao | -- | `title`, `body` | `icon` |
| `numbered-item` | Item Numerado | -- | `number`, `body` | -- |
| `numbered-heading` | Titulo Numerado | `heading` | `title` | -- |
| `numbered-subheading` | Subtitulo Numerado | `subheading` | `title` | -- |

### Adding a Custom Template

1. Create your HTML with Tailwind classes.
2. Add `data-editable="key"` to text zones and `data-swappable="key"` to image zones.
3. Optionally add `data-autonumber` to a placeholder element and set `autonumber` on the template.
4. Push to the `DESIGN_TEMPLATES` array in `registry.ts`.

```ts
import { DESIGN_TEMPLATES } from './components/designBlocks/registry';

DESIGN_TEMPLATES.push({
  id: 'info-box',
  name: 'Info Box',
  defaults: {
    title: 'Did you know?',
    body: 'Enter informational text here.',
  },
  html: `
    <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
      <p data-editable="title" class="font-bold text-blue-800 text-sm mb-1"></p>
      <p data-editable="body" class="text-blue-700 text-sm leading-relaxed"></p>
    </div>
  `,
});
```

### Autonumbering Behavior

Blocks with `autonumber: 'heading'` increment a top-level counter (1, 2, 3, ...). Blocks with `autonumber: 'subheading'` increment a nested counter that resets on each new heading (1.1, 1.2, 2.1, ...). The computed number is injected into any element with the `data-autonumber` attribute.

---

## Section Navigation System

The section navigation system provides a table-of-contents-style navigation bar on paginated pages. It automatically detects heading blocks and design blocks with `autonumber` and creates clickable navigation buttons.

### Which blocks become sections?

| Block | Section Level |
|-------|---------------|
| `h1` | `heading` |
| `h2` | `subheading` |
| `h3` | `subheading` |
| Design block with `autonumber: 'heading'` | `heading` |
| Design block with `autonumber: 'subheading'` | `subheading` |

### SectionItem

Each detected heading produces a `SectionItem`:

| Field | Type | Description |
|-------|------|-------------|
| `blockId` | `string` | The block ID of the heading. |
| `originalLabel` | `string` | Original heading text (HTML stripped). |
| `customLabel` | `string` | Display label (custom if set, otherwise truncated `originalLabel`). |
| `isHidden` | `boolean` | Whether this section is hidden from the nav bar. |
| `level` | `'heading' \| 'subheading'` | Hierarchy level. |
| `autoNumber` | `string` | Computed number string (e.g. `"1"`, `"2.1"`). |

### How it works

1. The `useSectionNav` hook scans `blocks` for heading-level blocks and builds a `SectionItem[]` array.
2. Custom labels and hidden state are persisted in document metadata under the `sectionNav` key.
3. In paginated mode, each page checks whether the nav bar should be shown (based on `SectionNavConfig.pages`).
4. Buttons show as "active" when their heading block exists on the current page.
5. When the number of visible sections exceeds `maxButtons`, the nav collapses to a single summary button and an auto-generated TOC page is inserted at page index 1.

### Collapse Behavior

When `config.sectionNav.maxButtons` is set and the visible section count exceeds it:

- The per-page nav is replaced by a single "Sumario" button.
- Clicking "Sumario" scrolls to an automatically inserted TOC page (rendered at page index 1).
- The TOC page lists all sections with their page numbers.

### Floating Section Panel

When sections exist, a floating side panel (`SectionNavPanel`) appears. It allows users to:

- View all sections in document order.
- Click to scroll to any section.
- Set custom labels for nav buttons.
- Toggle section visibility in the nav bar.

---

## Usage Examples

### Basic Editor with A4 Pages

```tsx
<NotionEditor
  defaultViewMode="paginated"
  title="My Document"
  onChange={(blocks) => console.log('Updated:', blocks)}
/>
```

### Custom Page Size (US Letter)

```tsx
<NotionEditor
  config={{
    page: {
      width: 816,   // 8.5" at 96dpi
      height: 1056,  // 11" at 96dpi
      paddingTop: 72,
      paddingRight: 72,
      paddingBottom: 72,
      paddingLeft: 72,
    },
  }}
/>
```

### With Image Upload and Custom Fonts

```tsx
<NotionEditor
  config={{
    uploadImage: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const { url } = await res.json();
      return url;
    },
    fetchFonts: async () => {
      const res = await fetch('/api/custom-fonts');
      return res.json();
    },
  }}
/>
```

### Section Navigation with Custom Button Template

```tsx
<NotionEditor
  config={{
    sectionNav: {
      position: 'header',
      pages: 'all',
      maxButtons: 8,
      maxLabelLength: 20,
      buttonTemplate: {
        activeHtml: '<div class="bg-indigo-600 text-white rounded px-2 py-1 text-xs font-semibold shadow">{{number}}. {{label}}</div>',
        inactiveHtml: '<div class="bg-gray-50 text-gray-400 rounded px-2 py-1 text-xs border">{{number}}. {{label}}</div>',
      },
    },
  }}
/>
```

### Section Nav on Specific Pages Only

```tsx
<NotionEditor
  config={{
    sectionNav: {
      position: 'footer',
      pages: [0, 1, 2],  // only first three pages (0-indexed)
    },
  }}
/>
```

### Section Nav with Custom Filter Function

```tsx
<NotionEditor
  config={{
    sectionNav: {
      pages: (pageIndex, totalPages) => pageIndex > 0,  // skip first page
    },
  }}
/>
```

### Collaboration Mode with Custom Data Source

```tsx
import { EditorDataSourceInterface } from './app/editor/types';

function useYjsDataSource(roomId: string): EditorDataSourceInterface {
  // Implementation would use Yjs Y.Array for blocks, Y.Map for metadata,
  // and Yjs UndoManager for undo/redo.
  return {
    blocks,
    setBlocks: (newBlocks) => yDoc.transact(() => { /* update Y.Array */ }),
    undo: () => { undoManager.undo(); return []; },
    redo: () => { undoManager.redo(); return []; },
    canUndo: undoManager.canUndo(),
    canRedo: undoManager.canRedo(),
    trackSelectedIds: (ids) => { /* store for undo restoration */ },
    meta: yMeta.toJSON(),
    setMeta: (updates) => yDoc.transact(() => { /* merge into Y.Map */ }),
  };
}

function CollaborativeEditor({ roomId }: { roomId: string }) {
  const dataSource = useYjsDataSource(roomId);

  return (
    <NotionEditor
      dataSource={dataSource}
      onBlockFocus={(blockId) => broadcastCursor(roomId, blockId)}
      remoteUsers={remoteUsers}
      syncStatus={connectionStatus}
      config={{
        uploadImage: async (file) => uploadToSupabaseStorage(file),
      }}
    />
  );
}
```

### Programmatic Block Construction

```tsx
const blocks: BlockData[] = [
  { id: 'b1', type: 'h1', content: 'Project Report' },
  { id: 'b2', type: 'text', content: 'This is the <b>introduction</b> paragraph.' },
  { id: 'b3', type: 'divider', content: '' },
  { id: 'b4', type: 'h2', content: 'Section 1' },
  { id: 'b5', type: 'bullet_list', content: 'First item' },
  { id: 'b6', type: 'bullet_list', content: 'Second item', indent: 1 },
  { id: 'b7', type: 'image', content: '', imageData: {
    src: 'https://example.com/chart.png',
    width: 80,
    alignment: 'center',
    caption: 'Figure 1: Sales data',
  }},
  { id: 'b8', type: 'table', content: '', tableData: {
    rows: [
      [{ content: 'Name' }, { content: 'Value' }],
      [{ content: 'Alpha' }, { content: '100' }],
    ],
    columnWidths: [200, 200],
    hasHeaderRow: true,
  }},
  { id: 'b9', type: 'design_block', content: '', designBlockData: {
    templateId: 'attention-callout',
    values: {
      icon: 'https://api.iconify.design/mdi:alert-outline.svg?width=32&height=32&color=%237c3aed',
      title: 'Important',
      body: 'Do not forget to review section 3.',
    },
  }},
  { id: 'b10', type: 'text', content: '', align: 'center', fullWidth: true },
];

<NotionEditor initialBlocks={blocks} />
```

---

## File Locations

| File | Purpose |
|------|---------|
| `app/editor/NotionEditor.tsx` | Main component export and inner rendering logic. |
| `app/editor/types/index.ts` | All TypeScript type definitions. |
| `app/editor/EditorProvider.tsx` | Data source interface, local data source hook, and React context provider. |
| `app/editor/components/designBlocks/registry.ts` | Design block template registry and `getTemplate()` helper. |
| `app/editor/hooks/useSectionNav.ts` | Section navigation hook, section item types, and heading detection logic. |
