'use client';

// ---------------------------------------------------------------------------
// useSectionNav — extracts document sections (headings + numbered design blocks)
//
// Sections are derived from:
//   - h1, h2, h3 blocks → heading / subheading levels
//   - Design blocks with autonumber: 'heading' or 'subheading' (from registry)
//
// Provides:
//   - sections: SectionItem[] with auto-numbering, custom labels, visibility
//   - scrollToSection: smooth-scrolls the scroll container to the block
//   - setCustomLabel / toggleHidden: persist button labels in document metadata
//   - hasSections: true when at least one section exists
//
// Section metadata (custom labels, hidden IDs) is stored in the document meta
// under the key `sectionNav` and syncs with Yjs in collaboration mode.
// ---------------------------------------------------------------------------

import { useCallback, useMemo } from 'react';
import { BlockData } from '../types';
import { getTemplate } from '../components/designBlocks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Heading level for section items */
export type SectionLevel = 'heading' | 'subheading';

export interface SectionItem {
  /** Block ID */
  blockId: string;
  /** Original heading text (stripped of HTML) */
  originalLabel: string;
  /** Custom label for buttons. Falls back to truncated originalLabel */
  customLabel: string;
  /** Whether this section button is hidden from the nav bar */
  isHidden: boolean;
  /** Level: heading (h1, numbered-heading) or subheading (h2, h3, numbered-subheading) */
  level: SectionLevel;
  /** Auto-number string (e.g. "1", "1.1") — computed from document order */
  autoNumber: string;
}

export interface SectionNavMeta {
  /** Custom labels keyed by block ID */
  labels?: Record<string, string>;
  /** Hidden section IDs */
  hidden?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, '');
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent?.trim() || '';
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '...';
}

/** Check if a block is a section-level heading (h1/h2/h3 or design block with autonumber) */
function getSectionLevel(block: BlockData): SectionLevel | null {
  if (block.type === 'h1') return 'heading';
  if (block.type === 'h2' || block.type === 'h3') return 'subheading';
  if (block.type === 'design_block' && block.designBlockData) {
    const tpl = getTemplate(block.designBlockData.templateId);
    if (tpl?.autonumber === 'heading') return 'heading';
    if (tpl?.autonumber === 'subheading') return 'subheading';
  }
  return null;
}

/** Get the display text for a section block */
function getSectionText(block: BlockData): string {
  if (block.type === 'design_block' && block.designBlockData) {
    // Use the "title" editable value from the design block
    return block.designBlockData.values.title || '';
  }
  return stripHtml(block.content);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseSectionNavOptions {
  blocks: BlockData[];
  /** Section nav metadata from document meta */
  sectionNavMeta: SectionNavMeta;
  /** Update section nav metadata */
  setSectionNavMeta: (meta: SectionNavMeta) => void;
  /** Ref to the scroll container (for manual scroll calculation with zoom) */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Maximum characters for button labels (default: 16) */
  maxLabelLength?: number;
}

export function useSectionNav({
  blocks,
  sectionNavMeta,
  setSectionNavMeta,
  scrollRef,
  maxLabelLength = 16,
}: UseSectionNavOptions) {
  // Build section items with auto-numbering
  const sections: SectionItem[] = useMemo(() => {
    const labels = sectionNavMeta.labels || {};
    const hiddenSet = new Set(sectionNavMeta.hidden || []);

    const items: SectionItem[] = [];
    let headingCount = 0;
    let subCount = 0;

    for (const block of blocks) {
      const level = getSectionLevel(block);
      if (!level) continue;

      let autoNumber: string;
      if (level === 'heading') {
        headingCount++;
        subCount = 0;
        autoNumber = String(headingCount);
      } else {
        subCount++;
        autoNumber = `${headingCount || 1}.${subCount}`;
      }

      const original = getSectionText(block) || 'Sem título';
      const custom = labels[block.id] || '';

      items.push({
        blockId: block.id,
        originalLabel: original,
        customLabel: custom || truncate(original, maxLabelLength),
        isHidden: hiddenSet.has(block.id),
        level,
        autoNumber,
      });
    }

    return items;
  }, [blocks, sectionNavMeta, maxLabelLength]);

  // Map: blockId → which page index it lives on (computed externally, passed via pageBlockMap)
  // This hook doesn't need pages — the "active" logic is handled by the component receiving pageBlockIds

  // Scroll to a heading block — calculates position manually to work with zoom/transform
  const scrollToSection = useCallback((blockId: string) => {
    const scrollEl = scrollRef.current;
    const blockEl = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
    if (!scrollEl || !blockEl) return;

    // Get block position relative to the scroll container
    const scrollRect = scrollEl.getBoundingClientRect();
    const blockRect = blockEl.getBoundingClientRect();

    // Current scroll + block offset from scroll container top, with a small margin
    const targetScroll = scrollEl.scrollTop + (blockRect.top - scrollRect.top) - 20;

    scrollEl.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }, [scrollRef]);

  // Update custom label for a heading
  const setCustomLabel = useCallback((blockId: string, label: string) => {
    const newLabels = { ...(sectionNavMeta.labels || {}), [blockId]: label };
    if (!label) delete newLabels[blockId];
    setSectionNavMeta({ ...sectionNavMeta, labels: newLabels });
  }, [sectionNavMeta, setSectionNavMeta]);

  // Toggle heading visibility in nav
  const toggleHidden = useCallback((blockId: string) => {
    const hidden = new Set(sectionNavMeta.hidden || []);
    if (hidden.has(blockId)) {
      hidden.delete(blockId);
    } else {
      hidden.add(blockId);
    }
    setSectionNavMeta({ ...sectionNavMeta, hidden: Array.from(hidden) });
  }, [sectionNavMeta, setSectionNavMeta]);

  return {
    sections,
    scrollToSection,
    setCustomLabel,
    toggleHidden,
    hasSections: sections.length > 0,
  };
}
