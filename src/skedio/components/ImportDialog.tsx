import React, { useState, useRef } from 'react';
import { Upload, FileImage, AlertTriangle, Zap, Maximize2, Tag, Plus, Check } from 'lucide-react';
import { DragScroll } from './DragScroll';
import { ensureWithinDimensions, probeImageDimensions, MAX_SAFE_IMAGE_DIMENSION } from '../lib/imageProcessor';

interface ImportDialogProps {
  onImageImported: (dataUrl: string, fileName: string, category?: string) => void;
  categories: string[];
  onAddCategory?: (name: string) => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  onImageImported,
  categories,
  onAddCategory,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [pendingDimensions, setPendingDimensions] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    onAddCategory?.(trimmed);
    setSelectedCategory(trimmed);
    setNewCategory('');
    setAddingCategory(false);
  };

  const handleFileSelect = (file: File) => {
    setError(null);
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file format. Please import a JPG, JPEG, PNG, or WEBP image.');
      return;
    }
    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File size exceeds the maximum limit of 50 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const dims = await probeImageDimensions(dataUrl);
      if (!dims) {
        setError('This image could not be read. It may be corrupted or in an unsupported format.');
        return;
      }
      const oversizedPixels = dims.width > MAX_SAFE_IMAGE_DIMENSION || dims.height > MAX_SAFE_IMAGE_DIMENSION;
      if (file.size > 5 * 1024 * 1024 || oversizedPixels) {
        setPendingDimensions(dims);
        setPendingFile(file);
        setFilePreview(dataUrl);
      } else {
        onImageImported(dataUrl, file.name.replace(/\.[^/.]+$/, ''), selectedCategory || undefined);
      }
    };
    reader.onerror = () => setError('Could not read the selected file.');
    reader.readAsDataURL(file);
  };

  const handleCompressAndImport = async () => {
    if (!filePreview || !pendingFile) return;
    setIsProcessing(true);
    const result = await ensureWithinDimensions(filePreview, 2048, 'image/jpeg', 0.85);
    setIsProcessing(false);
    if (!result) {
      setError('This image could not be processed. It may be corrupted.');
      return;
    }
    onImageImported(result.dataUrl, pendingFile.name.replace(/\.[^/.]+$/, ''), selectedCategory || undefined);
    setPendingFile(null);
    setFilePreview(null);
    setPendingDimensions(null);
  };

  const handleKeepOriginalAndImport = async () => {
    if (!filePreview || !pendingFile) return;
    setIsProcessing(true);
    // Still capped at MAX_SAFE_IMAGE_DIMENSION to protect against Android
    // Canvas/WebView pixel-count limits — but only actually re-encodes when
    // the source genuinely exceeds that cap. Images that triggered this
    // dialog purely on file size (not pixel dimensions) are imported with
    // their original bytes completely untouched, matching "Keep Original".
    const result = await ensureWithinDimensions(filePreview, MAX_SAFE_IMAGE_DIMENSION, 'image/jpeg', 0.92);
    setIsProcessing(false);
    if (!result) {
      setError('This image could not be processed. It may be corrupted.');
      return;
    }
    const finalUrl = result.wasResized ? result.dataUrl : filePreview;
    onImageImported(finalUrl, pendingFile.name.replace(/\.[^/.]+$/, ''), selectedCategory || undefined);
    setPendingFile(null);
    setFilePreview(null);
    setPendingDimensions(null);
  };

  return (
    <div className="w-full">
      {/* Category selection before import */}
      <div className="mb-4 bg-[#181818] border border-white/10 p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/70">
            <Tag size={14} className="text-amber-400" />
            <span>Category (optional):</span>
          </div>
          {onAddCategory && !addingCategory && (
            <button
              onClick={() => setAddingCategory(true)}
              className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-400 hover:text-amber-300"
            >
              <Plus size={13} /> New
            </button>
          )}
        </div>

        {addingCategory && (
          <div className="mb-3 flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="New category name..."
              className="flex-1 bg-[#121212] border border-white/25 px-3 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white"
            />
            <button
              onClick={handleAddCategory}
              className="flex items-center gap-1 bg-white text-black px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide hover:bg-white/90"
            >
              <Check size={14} /> Add
            </button>
          </div>
        )}

        {categories.length === 0 && !addingCategory ? (
          <p className="text-xs text-white/40">No categories yet. Create one to organize your artwork.</p>
        ) : (
          <DragScroll>
            <div className="flex gap-1.5 w-max pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide shrink-0 transition-colors ${
                    selectedCategory === cat
                      ? 'bg-rose-600 text-white font-extrabold shadow'
                      : 'bg-[#222222] text-white/70 hover:text-white hover:bg-[#2e2e2e]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </DragScroll>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
          }
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed transition-all cursor-pointer rounded-none select-none group ${
          dragActive
            ? 'border-white bg-white/10 scale-[1.01]'
            : 'border-white/20 bg-[#181818] hover:border-white/40 hover:bg-[#202020]'
        }`}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-none bg-white/5 border border-white/10 text-white mb-4 group-hover:scale-110 transition-transform">
          <Upload size={32} />
        </div>
        <h3 className="text-lg font-bold text-white tracking-wide">Import Image for Tracing</h3>
        <p className="text-sm text-white/60 mt-1 text-center max-w-sm">
          Tap to browse device storage or drag & drop artwork here
        </p>
        <div className="flex items-center gap-4 mt-4 text-xs font-semibold uppercase tracking-wider text-white/40">
          <span>JPG • PNG • WEBP</span>
          <span>•</span>
          <span>Max 50 MB</span>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-3 bg-rose-950/80 border border-rose-500/40 p-3.5 text-rose-200 text-sm">
          <AlertTriangle size={20} className="shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Large Image Compression Modal */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#181818] border border-white/20 p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-amber-500/20 border border-amber-500/40 text-amber-400">
                <FileImage size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">Large Image Detected</h3>
                <p className="text-sm text-white/70 mt-1">
                  You imported <span className="font-semibold text-white">{pendingFile.name}</span> (
                  {(pendingFile.size / 1024 / 1024).toFixed(1)} MB
                  {pendingDimensions ? `, ${pendingDimensions.width}×${pendingDimensions.height}px` : ''}
                  ). Large files and high-resolution images can reduce canvas gesture framerate — and on
                  some Android devices, may fail to render at all — so we recommend optimizing.
                </p>
              </div>
            </div>

            {filePreview && (
              <div className="mt-4 h-40 w-full overflow-hidden border border-white/10 bg-[#121212] flex items-center justify-center">
                <img src={filePreview} alt="Preview" className="max-h-full max-w-full object-contain" />
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleCompressAndImport}
                disabled={isProcessing}
                className="flex items-center justify-center gap-2 bg-white text-black font-bold py-3 px-4 hover:bg-white/90 transition-colors disabled:opacity-60"
              >
                <Zap size={18} />
                <span>{isProcessing ? 'Processing…' : 'Optimize & Compress'}</span>
              </button>
              <button
                onClick={handleKeepOriginalAndImport}
                disabled={isProcessing}
                className="flex items-center justify-center gap-2 bg-[#262626] border border-white/20 text-white font-bold py-3 px-4 hover:bg-[#333333] transition-colors disabled:opacity-60"
              >
                <Maximize2 size={18} />
                <span>{isProcessing ? 'Processing…' : 'Keep Original'}</span>
              </button>
            </div>
            <p className="mt-2 text-[11px] text-white/40 text-center">
              "Keep Original" preserves full quality, automatically staying under {MAX_SAFE_IMAGE_DIMENSION}px
              per side only if needed to keep the image safe on Android devices.
            </p>

            <button
              onClick={() => {
                setPendingFile(null);
                setFilePreview(null);
                setPendingDimensions(null);
              }}
              className="mt-4 w-full text-center text-xs text-white/40 hover:text-white uppercase tracking-wider py-2"
            >
              Cancel Import
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
