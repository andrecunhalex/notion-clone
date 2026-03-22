'use client';

import React, { useState } from 'react';

export const Tooltip: React.FC<{ label: string; shortcut: string; children: React.ReactNode }> = ({ label, shortcut, children }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-[60] pointer-events-none">
          <span>{label}</span>
          <span className="ml-1.5 text-gray-400">{shortcut}</span>
        </div>
      )}
    </div>
  );
};
