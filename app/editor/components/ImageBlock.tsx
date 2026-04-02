'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ImagePlus, AlignLeft, AlignCenter, AlignRight, Trash2 } from 'lucide-react';
import { BlockData, ImageData, ImageAlignment } from '../types';

interface ImageBlockProps {
  block: BlockData;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  removeBlock: (id: string) => void;
  /** Custom uploader — returns URL. Falls back to base64 if not provided */
  uploadImage?: (file: File) => Promise<string | null>;
}

const DEFAULT_IMAGE_DATA: ImageData = {
  src: '',
  width: 50,
  alignment: 'center',
};

export const ImageBlock: React.FC<ImageBlockProps> = ({ block, updateBlock, removeBlock, uploadImage }) => {
  const imageData = block.imageData || DEFAULT_IMAGE_DATA;
  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  // Local width during resize — only committed to block state on mouseup
  const [resizeWidth, setResizeWidth] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ startX: number; startWidth: number; side: 'left' | 'right' } | null>(null);
  const didAutoOpen = useRef(false);

  const update = useCallback((updates: Partial<ImageData>) => {
    updateBlock(block.id, {
      imageData: { ...imageData, ...updates },
    });
  }, [block.id, imageData, updateBlock]);

  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;

    // If uploader available (Supabase Storage), use it — stores URL instead of base64
    if (uploadImage) {
      setIsUploading(true);
      const url = await uploadImage(file);
      setIsUploading(false);
      if (url) {
        update({ src: url });
        return;
      }
      // Fallback to base64 if upload fails
    }

    // Local mode: store as base64 data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      update({ src });
    };
    reader.readAsDataURL(file);
  }, [update, uploadImage]);

  const handleUploadClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFileSelect(file);
    };
    input.click();
  }, [handleFileSelect]);

  // Auto-open file picker when the image block is first created with no src
  useEffect(() => {
    if (!imageData.src && !didAutoOpen.current) {
      didAutoOpen.current = true;
      // Small delay to let the component mount
      setTimeout(() => handleUploadClick(), 50);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const currentPixelWidth = (imageData.width / 100) * containerWidth;

    resizeStartRef.current = {
      startX: e.clientX,
      startWidth: currentPixelWidth,
      side,
    };
    setResizeWidth(imageData.width);
    setIsResizing(true);
  }, [imageData.width]);

  const alignmentRef = useRef(imageData.alignment);
  alignmentRef.current = imageData.alignment;
  const updateRef = useRef(update);
  updateRef.current = update;
  const resizeWidthRef = useRef(resizeWidth);
  resizeWidthRef.current = resizeWidth;

  useEffect(() => {
    if (!isResizing) return;

    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    let rafId = 0;
    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!resizeStartRef.current || !containerRef.current) return;
        const { startX, startWidth, side } = resizeStartRef.current;
        const containerWidth = containerRef.current.offsetWidth;
        const deltaX = e.clientX - startX;
        const alignment = alignmentRef.current;

        let newPixelWidth: number;
        if (alignment === 'center') {
          const effectiveDelta = side === 'right' ? deltaX : -deltaX;
          newPixelWidth = startWidth + effectiveDelta * 2;
        } else if (alignment === 'left') {
          newPixelWidth = side === 'right' ? startWidth + deltaX : startWidth - deltaX;
        } else {
          newPixelWidth = side === 'left' ? startWidth - deltaX : startWidth + deltaX;
        }

        const newPercent = Math.max(10, Math.min(100, (newPixelWidth / containerWidth) * 100));
        // Only update local visual state during drag — no sync broadcast
        setResizeWidth(Math.round(newPercent));
      });
    };

    const handleMouseUp = () => {
      cancelAnimationFrame(rafId);
      // Commit final width to block state (triggers Yjs sync once)
      if (resizeWidthRef.current !== null) {
        updateRef.current({ width: resizeWidthRef.current });
      }
      setResizeWidth(null);
      setIsResizing(false);
      resizeStartRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    };
  }, [isResizing]);

  const alignmentStyles: Record<ImageAlignment, string> = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  const widthPercent = resizeWidth ?? imageData.width;

  // Empty state - upload placeholder
  if (!imageData.src) {
    return (
      <div
        ref={containerRef}
        className="my-2 flex justify-center"
      >
        <div
          onClick={isUploading ? undefined : handleUploadClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`w-full border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center gap-3 transition-colors ${
            isUploading ? 'opacity-60' : 'cursor-pointer hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          {isUploading ? (
            <>
              <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              <div className="text-sm text-gray-500">Enviando imagem...</div>
            </>
          ) : (
            <>
              <ImagePlus size={40} className="text-gray-400" />
              <div className="text-sm text-gray-500">
                Clique para adicionar uma imagem ou arraste aqui
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`my-2 flex ${alignmentStyles[imageData.alignment]}`}
      data-resizing={isResizing || undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { if (!isResizing) setIsHovered(false); }}
    >
      <div
        className="relative group/image inline-block"
        style={{ width: `${widthPercent}%` }}
      >
        {/* Image */}
        <img
          src={imageData.src}
          alt=""
          className={`w-full rounded-sm select-none ${showToolbar ? 'ring-2 ring-blue-500' : ''}`}
          draggable={false}
          onClick={() => setShowToolbar(!showToolbar)}
        />

        {/* Left resize handle */}
        {(isHovered || isResizing) && (
          <div
            className="absolute left-0 top-0 bottom-0 w-4 flex items-center justify-center cursor-col-resize z-10"
            onMouseDown={(e) => handleResizeStart(e, 'left')}
          >
            <div className={`w-1 rounded-full transition-all ${
              isResizing ? 'h-full bg-blue-500' : 'h-1/3 bg-gray-400/70 hover:bg-blue-500 hover:h-1/2'
            }`} />
          </div>
        )}

        {/* Right resize handle */}
        {(isHovered || isResizing) && (
          <div
            className="absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center cursor-col-resize z-10"
            onMouseDown={(e) => handleResizeStart(e, 'right')}
          >
            <div className={`w-1 rounded-full transition-all ${
              isResizing ? 'h-full bg-blue-500' : 'h-1/3 bg-gray-400/70 hover:bg-blue-500 hover:h-1/2'
            }`} />
          </div>
        )}

        {/* Alignment toolbar */}
        {showToolbar && (
          <div
            className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-gray-900 rounded-lg p-1 shadow-xl z-20"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ToolbarButton
              active={imageData.alignment === 'left'}
              onClick={() => update({ alignment: 'left' })}
              title="Alinhar à esquerda"
            >
              <AlignLeft size={16} />
            </ToolbarButton>
            <ToolbarButton
              active={imageData.alignment === 'center'}
              onClick={() => update({ alignment: 'center' })}
              title="Centralizar"
            >
              <AlignCenter size={16} />
            </ToolbarButton>
            <ToolbarButton
              active={imageData.alignment === 'right'}
              onClick={() => update({ alignment: 'right' })}
              title="Alinhar à direita"
            >
              <AlignRight size={16} />
            </ToolbarButton>
            <div className="w-px h-5 bg-gray-700 mx-0.5" />
            <ToolbarButton
              active={false}
              onClick={handleUploadClick}
              title="Trocar imagem"
            >
              <ImagePlus size={16} />
            </ToolbarButton>
            <ToolbarButton
              active={false}
              onClick={() => removeBlock(block.id)}
              title="Remover"
              danger
            >
              <Trash2 size={16} />
            </ToolbarButton>
          </div>
        )}

        {/* Width indicator during resize */}
        {isResizing && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/75 text-white text-xs px-2 py-1 rounded z-20">
            {widthPercent}%
          </div>
        )}
      </div>
    </div>
  );
};

// Toolbar button sub-component
const ToolbarButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ active, onClick, title, danger, children }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    title={title}
    className={`p-1.5 rounded transition-colors ${
      active
        ? 'bg-gray-700 text-white'
        : danger
          ? 'text-gray-400 hover:text-red-400 hover:bg-gray-800'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`}
  >
    {children}
  </button>
);
