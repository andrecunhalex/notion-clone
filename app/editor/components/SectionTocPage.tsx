'use client';

import React, { memo } from 'react';
import { SectionItem } from '../hooks/useSectionNav';

// ---------------------------------------------------------------------------
// Auto-generated Table of Contents page
// Renders a properly numbered and indented TOC with dotted leaders
// ---------------------------------------------------------------------------

interface SectionTocPageProps {
  sections: SectionItem[];
  /** Map from blockId → display page number (1-based, accounting for the TOC page) */
  sectionPageMap: Record<string, number>;
  onScrollTo: (blockId: string) => void;
  activeColor?: string;
}

const SectionTocPageInner: React.FC<SectionTocPageProps> = ({
  sections,
  sectionPageMap,
  onScrollTo,
  activeColor = '#7c3aed',
}) => {
  return (
    <div className="flex flex-col h-full">
      <h2
        className="text-2xl font-bold mb-8"
        style={{ color: activeColor }}
      >
        Sumário
      </h2>

      <div className="flex flex-col">
        {sections.map(section => {
          const pageNum = sectionPageMap[section.blockId];
          const isSubheading = section.level === 'subheading';

          return (
            <button
              key={section.blockId}
              onClick={() => onScrollTo(section.blockId)}
              className={`group flex items-baseline gap-3 py-1.5 text-left hover:bg-gray-50 rounded transition-colors ${
                isSubheading ? 'pl-8' : ''
              }`}
            >
              {/* Number */}
              <span
                className={`shrink-0 tabular-nums ${
                  isSubheading
                    ? 'text-sm text-gray-500 w-8'
                    : 'text-base font-semibold w-6'
                }`}
                style={!isSubheading ? { color: activeColor } : undefined}
              >
                {section.autoNumber}.
              </span>

              {/* Title with dotted leader */}
              <span
                className={`flex-1 min-w-0 truncate ${
                  isSubheading
                    ? 'text-sm text-gray-600'
                    : 'text-base font-medium text-gray-800'
                }`}
              >
                {section.originalLabel}
              </span>

              {/* Dotted leader */}
              <span className="flex-shrink-0 border-b border-dotted border-gray-300 flex-1 min-w-4 mb-1" />

              {/* Page number */}
              {pageNum !== undefined && (
                <span className="text-sm text-gray-400 tabular-nums shrink-0">
                  {pageNum}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const SectionTocPage = memo(SectionTocPageInner);
