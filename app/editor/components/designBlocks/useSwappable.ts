'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Hook: useSwappable
// Manages the swap flow for design block images/icons:
//   popover choice → file upload OR icon picker → save value + update DOM
// ---------------------------------------------------------------------------

interface UseSwappableOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  saveValues: (updated: Record<string, string>) => void;
  uploadImage?: (file: File) => Promise<string | null>;
}

export function useSwappable({ containerRef, saveValues, uploadImage }: UseSwappableOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSwapKey = useRef<string | null>(null);
  const activeSwapEl = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [swapPopover, setSwapPopover] = useState<{ x: number; y: number } | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPickerPos, setIconPickerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  /** Convert viewport coords to absolute coords within the scroll container */
  const toAbsolute = useCallback((vx: number, vy: number): { x: number; y: number } => {
    const scrollEl = containerRef.current?.closest('.overflow-y-auto') as HTMLElement | null;
    if (!scrollEl) return { x: vx, y: vy };
    const sr = scrollEl.getBoundingClientRect();
    return { x: vx - sr.left + scrollEl.scrollLeft, y: vy - sr.top + scrollEl.scrollTop };
  }, [containerRef]);

  // --- Attach hover + click listeners to swappable elements ---
  const attachSwapListeners = useCallback((container: HTMLElement) => {
    container.querySelectorAll<HTMLElement>('[data-swappable]').forEach(el => {
      el.style.cursor = 'pointer';
      el.style.transition = 'box-shadow 0.15s ease';
      el.addEventListener('mouseenter', () => {
        el.style.boxShadow = '0 0 0 2px rgba(139, 92, 246, 0.5)';
        el.style.borderRadius = '8px';
      });
      el.addEventListener('mouseleave', () => {
        el.style.boxShadow = 'none';
      });
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        activeSwapKey.current = el.getAttribute('data-swappable');
        activeSwapEl.current = el;
        const rect = el.getBoundingClientRect();
        setSwapPopover(toAbsolute(rect.left + rect.width / 2, rect.bottom + 6));
      });
    });
  }, [toAbsolute]);

  // --- Recalculate icon picker position from the swappable element ---
  const updateIconPickerPos = useCallback(() => {
    const el = activeSwapEl.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setIconPickerPos(toAbsolute(rect.left + rect.width / 2, rect.bottom + 6));
  }, [toAbsolute]);

  // --- Close popover on click outside ---
  useEffect(() => {
    if (!swapPopover) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        setSwapPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [swapPopover]);

  // --- Update the DOM image immediately after a value change ---
  const updateSwapImage = useCallback((key: string, src: string) => {
    const img = containerRef.current?.querySelector(`[data-swappable="${key}"]`) as HTMLImageElement;
    if (img) img.src = src;
  }, [containerRef]);

  // --- File upload handler ---
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const key = activeSwapKey.current;
    if (!file || !key) return;

    let src: string;
    if (uploadImage) {
      const url = await uploadImage(file);
      src = url || URL.createObjectURL(file);
    } else {
      src = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }

    saveValues({ [key]: src });
    updateSwapImage(key, src);
    e.target.value = '';
    activeSwapKey.current = null;
  }, [uploadImage, saveValues, updateSwapImage]);

  // --- Icon select handler ---
  const handleIconSelect = useCallback((url: string) => {
    const key = activeSwapKey.current;
    if (!key) return;

    saveValues({ [key]: url });
    updateSwapImage(key, url);
    setIconPickerOpen(false);
    activeSwapKey.current = null;
    activeSwapEl.current = null;
  }, [saveValues, updateSwapImage]);

  const handleCloseIconPicker = useCallback(() => {
    setIconPickerOpen(false);
    activeSwapKey.current = null;
  }, []);

  // --- Popover action handlers ---
  const openIconPicker = useCallback(() => {
    setSwapPopover(null);
    updateIconPickerPos();
    setIconPickerOpen(true);
  }, [updateIconPickerPos]);

  const openFileInput = useCallback(() => {
    setSwapPopover(null);
    fileInputRef.current?.click();
  }, []);

  /** The scroll container element to portal into (for absolute positioning) */
  const getPortalTarget = useCallback((): HTMLElement => {
    return (containerRef.current?.closest('.overflow-y-auto') as HTMLElement) || document.body;
  }, [containerRef]);

  return {
    fileInputRef,
    popoverRef,
    swapPopover,
    iconPickerOpen,
    iconPickerPos,
    attachSwapListeners,
    handleFileChange,
    handleIconSelect,
    handleCloseIconPicker,
    openIconPicker,
    openFileInput,
    getPortalTarget,
  };
}
