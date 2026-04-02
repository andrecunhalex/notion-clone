'use client';

import React, { memo, useMemo } from 'react';
import { SectionNavPosition, SectionNavButtonTemplate } from '../types';
import { SectionItem } from '../hooks/useSectionNav';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SectionNavProps {
  sections: SectionItem[];
  position: SectionNavPosition;
  onScrollTo: (blockId: string) => void;
  /** Set of block IDs that are on THIS page (for active state) */
  pageBlockIds: Set<string>;
  /** If true, collapse all buttons into a single "Sumário" button */
  collapsed?: boolean;
  /** Called when the collapsed "Sumário" button is clicked */
  onSummaryClick?: () => void;
  /** Active color for default buttons (default: #7c3aed). Ignored when buttonTemplate is set. */
  activeColor?: string;
  /** Custom button template with separate active/inactive HTML. Overrides default buttons. */
  buttonTemplate?: SectionNavButtonTemplate;
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

function interpolate(html: string, section: SectionItem): string {
  return html
    .replace(/\{\{label\}\}/g, section.customLabel)
    .replace(/\{\{number\}\}/g, section.autoNumber)
    .replace(/\{\{title\}\}/g, section.originalLabel);
}

// ---------------------------------------------------------------------------
// Template button — active and inactive are completely different HTML
// ---------------------------------------------------------------------------

const TemplateButton: React.FC<{
  section: SectionItem;
  isActive: boolean;
  template: SectionNavButtonTemplate;
  onClick: () => void;
}> = ({ section, isActive, template, onClick }) => {
  const innerHTML = useMemo(
    () => interpolate(isActive ? template.activeHtml : template.inactiveHtml, section),
    [template, section, isActive],
  );

  return (
    <button
      onClick={onClick}
      title={section.originalLabel}
      className="transition-all"
      dangerouslySetInnerHTML={{ __html: innerHTML }}
    />
  );
};

// ---------------------------------------------------------------------------
// Default button (no template)
// ---------------------------------------------------------------------------

const DefaultButton: React.FC<{
  section: SectionItem;
  isActive: boolean;
  vertical: boolean;
  activeColor: string;
  onClick: () => void;
}> = ({ section, isActive, vertical, activeColor, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap truncate ${
      vertical ? 'max-w-30' : 'max-w-35'
    }`}
    style={
      isActive
        ? { backgroundColor: activeColor, borderColor: activeColor, color: '#fff' }
        : { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb', color: '#6b7280' }
    }
    title={section.originalLabel}
  >
    {section.customLabel}
  </button>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SectionNavInner: React.FC<SectionNavProps> = ({
  sections,
  position,
  onScrollTo,
  pageBlockIds,
  collapsed = false,
  onSummaryClick,
  activeColor = '#7c3aed',
  buttonTemplate,
}) => {
  const vertical = position === 'left' || position === 'right';
  const visibleSections = sections.filter(s => !s.isHidden);

  if (visibleSections.length === 0) return null;

  // Collapsed mode: single "Sumário" button
  if (collapsed) {
    const summaryBtn = buttonTemplate ? (
      <button
        onClick={onSummaryClick}
        className="transition-all"
        dangerouslySetInnerHTML={{
          __html: buttonTemplate.activeHtml
            .replace(/\{\{label\}\}/g, 'Sumário')
            .replace(/\{\{number\}\}/g, '')
            .replace(/\{\{title\}\}/g, 'Sumário'),
        }}
      />
    ) : (
      <button
        onClick={onSummaryClick}
        className="px-3 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap"
        style={{ backgroundColor: activeColor, borderColor: activeColor, color: '#fff' }}
      >
        Sumário
      </button>
    );

    return (
      <div
        data-section-nav
        className={`flex items-center gap-2 ${vertical ? 'flex-col py-2' : 'flex-wrap py-2'}`}
      >
        {summaryBtn}
      </div>
    );
  }

  return (
    <div
      data-section-nav
      className={`flex items-center gap-1.5 ${vertical ? 'flex-col py-2' : 'flex-wrap py-2'}`}
    >
      {visibleSections.map(section => {
        const isActive = pageBlockIds.has(section.blockId);

        return buttonTemplate ? (
          <TemplateButton
            key={section.blockId}
            section={section}
            isActive={isActive}
            template={buttonTemplate}
            onClick={() => onScrollTo(section.blockId)}
          />
        ) : (
          <DefaultButton
            key={section.blockId}
            section={section}
            isActive={isActive}
            vertical={vertical}
            activeColor={activeColor}
            onClick={() => onScrollTo(section.blockId)}
          />
        );
      })}
    </div>
  );
};

export const SectionNav = memo(SectionNavInner);
