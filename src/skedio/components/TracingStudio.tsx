import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Project,
  ImageAdjustments,
  TransformState,
  ToolOverlays,
  defaultTransform,
} from '../types';
import { applyImageFilters, generateThumbnail } from '../lib/imageProcessor';
import { saveProject } from '../lib/db';
import { OverlayTools } from './OverlayTools';
import {
  Lock,
  Unlock,
  Play,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Sliders,
  Ruler,
  Compass,
  Grid,
  RefreshCw,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';

interface TracingStudioProps {
  project: Project;
  onClose: () => void;
  onEnterTraceMode: (project: Project, processedUrl: string) => void;
}

// How long to wait, after the user stops moving a slider, before recomputing
// the (expensive) full-resolution preview and before persisting to IndexedDB.
// Two separate constants because the preview should feel responsive as soon
// as the user pauses, while the DB write can afford to wait a little longer
// to avoid writing on every micro-pause during a drag.
const PREVIEW_DEBOUNCE_MS = 120;
const SAVE_DEBOUNCE_MS = 600;
const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;

export const TracingStudio: React.FC<TracingStudioProps> = ({
  project: initialProject,
  onClose,
  onEnterTraceMode,
}) => {
  const [project, setProject] = useState<Project>(initialProject);
  const [processedUrl, setProcessedUrl] = useState<string>(initialProject.imageDataUrl);
  const [activeBottomTab, setActiveBottomTab] = useState<'adjustments' | 'transform' | 'tools' | null>(
    'adjustments'
  );
  const [saveStatus, setSaveStatus] = useState<string>('Saved');
  const [isProcessingFilter, setIsProcessingFilter] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchRef = useRef<{ dist: number; zoom: number; angle: number; rot: number } | null>(null);

  // --- SAVE / PERSISTENCE ARCHITECTURE -----------------------------------
  // A single source of truth (`project` state) drives the UI instantly, while
  // persistence to IndexedDB is decoupled behind:
  //   - projectRef:            always holds the latest project, readable from
  //                             timers/listeners without re-subscribing them.
  //   - isDirtyRef:             whether there are unsaved changes right now.
  //   - lastSavedAdjustmentsRef: the adjustments last written to disk, so we
  //                             can tell whether a thumbnail regeneration is
  //                             actually necessary (transform-only changes,
  //                             locking, and overlay moves never need one).
  //   - persistProject:        does the actual write; the only place that
  //                             talks to saveProject/generateThumbnail.
  //   - scheduleSave:          debounced path for rapid-fire changes (slider
  //                             drags, continuous pan/zoom/rotate, overlay
  //                             dragging).
  //   - triggerSave:           immediate path for discrete moments (drag end,
  //                             leaving the studio, entering Trace Mode,
  //                             Reset All, lock toggle) — cancels any pending
  //                             debounce first so we never double-write.
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const isDirtyRef = useRef(false);
  const lastSavedAdjustmentsRef = useRef<ImageAdjustments>(initialProject.adjustments);
  const saveDebounceTimerRef = useRef<number | null>(null);

  const persistProject = useCallback(async (projectToSave: Project) => {
    setSaveStatus('Saving...');
    try {
      // Only re-run the (comparatively expensive) thumbnail generation when
      // the pixel-affecting adjustments actually changed. Opacity is applied
      // live via CSS and never baked into the thumbnail; transform, lock,
      // and overlay-only changes don't touch pixels at all.
      const prevAdj = lastSavedAdjustmentsRef.current;
      const nextAdj = projectToSave.adjustments;
      const needsNewThumbnail =
        nextAdj.brightness !== prevAdj.brightness ||
        nextAdj.contrast !== prevAdj.contrast ||
        nextAdj.edgeDetection !== prevAdj.edgeDetection;

      const toSave = needsNewThumbnail
        ? { ...projectToSave, thumbnailDataUrl: await generateThumbnail(projectToSave.imageDataUrl, nextAdj) }
        : projectToSave;

      await saveProject({ ...toSave, updatedAt: Date.now() });
      lastSavedAdjustmentsRef.current = nextAdj;
      isDirtyRef.current = false;
      setSaveStatus('Saved');
    } catch {
      setSaveStatus('Save failed');
    }
  }, []);

  // Immediate save — cancels any pending debounce and writes right away.
  // Used for discrete, deliberate moments (gesture end, navigating away,
  // Reset All, lock toggle).
  const triggerSave = useCallback(
    (updatedProject: Project) => {
      if (saveDebounceTimerRef.current !== null) {
        window.clearTimeout(saveDebounceTimerRef.current);
        saveDebounceTimerRef.current = null;
      }
      isDirtyRef.current = true;
      persistProject(updatedProject);
    },
    [persistProject]
  );

  // Debounced save — used for rapid-fire changes (slider drags, continuous
  // pan/zoom/rotate, overlay dragging) so we don't write to IndexedDB (and
  // potentially regenerate a thumbnail) on every intermediate tick.
  const scheduleSave = useCallback(
    (updatedProject: Project) => {
      isDirtyRef.current = true;
      if (saveDebounceTimerRef.current !== null) {
        window.clearTimeout(saveDebounceTimerRef.current);
      }
      saveDebounceTimerRef.current = window.setTimeout(() => {
        saveDebounceTimerRef.current = null;
        persistProject(updatedProject);
      }, SAVE_DEBOUNCE_MS);
    },
    [persistProject]
  );

  // Periodic safety-net autosave. Deliberately has an empty dependency list
  // (besides the stable `persistProject`) so it is set up exactly once and
  // is NOT torn down/recreated on every edit — that was the original bug,
  // where the timer reset continuously while editing and therefore almost
  // never fired. It only writes if something is actually unsaved.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isDirtyRef.current) {
        persistProject(projectRef.current);
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [persistProject]);

  // Safety net for unexpected closure (Android backgrounding/killing the app,
  // browser tab discard, etc.) — flush any unsaved changes the moment the
  // app is hidden or the page is torn down, rather than relying solely on
  // the 5-minute interval or the explicit save points below.
  useEffect(() => {
    const flushIfDirty = () => {
      if (isDirtyRef.current) {
        persistProject(projectRef.current);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushIfDirty();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flushIfDirty);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flushIfDirty);
    };
  }, [persistProject]);

  const handleResetAll = () => {
    const nextProj = {
      ...project,
      adjustments: {
        opacity: 100,
        brightness: 0,
        contrast: 0,
        edgeDetection: 0,
      },
      transform: {
        zoom: 1.0,
        rotation: 0,
        panX: 0,
        panY: 0,
      },
    };
    setProject(nextProj);
    triggerSave(nextProj);
    setShowResetConfirm(false);
  };

  // Recompute the full-resolution preview only when a pixel-affecting
  // adjustment (brightness/contrast/edgeDetection) or the source image
  // itself changes — NOT when opacity changes, since opacity is applied
  // live via CSS `opacity` on the wrapping element and never touches this
  // canvas pipeline. This alone eliminates a full Sobel recompute on every
  // opacity slider tick. The short debounce additionally coalesces rapid
  // brightness/contrast/edge slider drags into a single recompute once the
  // user briefly pauses, keeping the UI smooth while dragging.
  const { brightness, contrast, edgeDetection } = project.adjustments;
  useEffect(() => {
    let active = true;
    setIsProcessingFilter(true);

    const debounce = window.setTimeout(() => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!active) return;
        const url = applyImageFilters(img, project.adjustments);
        setProcessedUrl(url);
        setIsProcessingFilter(false);
      };
      img.onerror = () => {
        if (!active) return;
        setProcessedUrl(project.imageDataUrl);
        setIsProcessingFilter(false);
      };
      img.src = project.imageDataUrl;
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(debounce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.imageDataUrl, brightness, contrast, edgeDetection]);

  // Update adjustments — instant for the UI (state updates synchronously so
  // the slider and its numeric readout always feel immediate), debounced for
  // the expensive canvas pipeline + IndexedDB write above.
  const handleAdjustmentChange = (key: keyof ImageAdjustments, val: number) => {
    const nextAdj = { ...project.adjustments, [key]: val };
    const nextProj = { ...project, adjustments: nextAdj };
    setProject(nextProj);
    scheduleSave(nextProj);
  };

  // Update transformations
  const handleTransformChange = (nextTransform: Partial<TransformState>) => {
    if (project.isLocked) return;
    const clampedZoom =
      nextTransform.zoom !== undefined
        ? Math.min(5.0, Math.max(0.1, Number(nextTransform.zoom.toFixed(2))))
        : project.transform.zoom;
    const formattedRot =
      nextTransform.rotation !== undefined
        ? Number(((nextTransform.rotation + 360) % 360).toFixed(1))
        : project.transform.rotation;

    const nextProj = {
      ...project,
      transform: {
        ...project.transform,
        ...nextTransform,
        zoom: clampedZoom,
        rotation: formattedRot,
      },
    };
    setProject(nextProj);
    // Debounced: covers both continuous drag/pinch (many ticks per second)
    // and single button clicks (+25%, -90°, etc). Drag gestures additionally
    // get an immediate flush on pointer-up below, so they never wait out the
    // debounce unnecessarily.
    scheduleSave(nextProj);
  };

  // Toggle lock
  const toggleLock = () => {
    const nextProj = { ...project, isLocked: !project.isLocked };
    setProject(nextProj);
    triggerSave(nextProj);
  };

  // Update overlays
  const updateOverlays = (nextOverlays: ToolOverlays) => {
    const nextProj = { ...project, overlays: nextOverlays };
    setProject(nextProj);
    scheduleSave(nextProj);
  };

  // --- MULTI-TOUCH & MOUSE GESTURES FOR PAN, ZOOM, ROTATE ---
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (project.isLocked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      isDraggingRef.current = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    } else if (activePointersRef.current.size === 2) {
      // 2 fingers: pinch to zoom + rotate
      const pts: Array<{ x: number; y: number }> = Array.from(activePointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      initialPinchRef.current = {
        dist,
        zoom: project.transform.zoom,
        angle,
        rot: project.transform.rotation,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (project.isLocked) return;
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1 && isDraggingRef.current) {
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      handleTransformChange({
        panX: project.transform.panX + dx,
        panY: project.transform.panY + dy,
      });
    } else if (activePointersRef.current.size === 2 && initialPinchRef.current) {
      const pts: Array<{ x: number; y: number }> = Array.from(activePointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      const zoomFactor = dist / (initialPinchRef.current.dist || 1);
      const newZoom = initialPinchRef.current.zoom * zoomFactor;
      const angleDiff = angle - initialPinchRef.current.angle;
      const newRot = initialPinchRef.current.rot + angleDiff;

      handleTransformChange({ zoom: newZoom, rotation: newRot });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (activePointersRef.current.size < 2) {
      initialPinchRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      isDraggingRef.current = false;
      triggerSave(project);
    }
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (project.isLocked) return;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    handleTransformChange({ zoom: project.transform.zoom + delta });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#121212] select-none overflow-hidden touch-none overscroll-none">
      {/* TOP FLOATING HEADER */}
      <header
        className="z-30 flex items-center justify-between bg-[#181818]/95 border-b border-white/10 py-3 backdrop-blur-md shadow-lg"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              triggerSave(project);
              onClose();
            }}
            className="flex h-10 w-10 items-center justify-center bg-white/5 border border-white/10 text-white hover:bg-white/15 transition-colors"
            title="Save & Return"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide truncate max-w-[180px] sm:max-w-xs">
              {project.name}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-white/50">
              <span
                className={`flex items-center gap-1 ${
                  saveStatus === 'Save failed' ? 'text-rose-400' : saveStatus === 'Saving...' ? 'text-white/50' : 'text-emerald-400'
                }`}
              >
                <CheckCircle2 size={11} /> {saveStatus}
              </span>
              <span>•</span>
              <span>Zoom: {(project.transform.zoom * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Reference Lock Button (CRITICAL FEATURE) */}
          <button
            onClick={toggleLock}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 font-bold text-xs uppercase tracking-wider transition-all border shadow-lg ${
              project.isLocked
                ? 'bg-rose-600 border-rose-400 text-white shadow-rose-900/50 animate-pulse'
                : 'bg-[#262626] border-white/20 text-white/80 hover:bg-[#333333] hover:text-white'
            }`}
          >
            {project.isLocked ? <Lock size={16} /> : <Unlock size={16} />}
            <span>{project.isLocked ? 'Locked' : 'Lock Image'}</span>
          </button>

          {/* Trace Mode Trigger Button */}
          <button
            onClick={() => {
              triggerSave(project);
              onEnterTraceMode(project, processedUrl);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black font-extrabold text-xs uppercase tracking-wider hover:bg-white/90 shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-all"
          >
            <Play size={16} className="fill-black" />
            <span className="hidden sm:inline">Start</span> Tracing
          </button>
        </div>
      </header>

      {/* FULLSCREEN TRACING CANVAS (#121212)
          touch-none + overscroll-none stop the browser's own pinch-zoom,
          double-tap-zoom, scroll, and pull-to-refresh gestures from firing
          alongside (or instead of) our custom pointer-based pan/zoom/rotate
          handling below. Without this, a two-finger pinch here would zoom
          the whole page AND the canvas simultaneously on Android Chrome. */}
      <main
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className={`relative flex-1 overflow-hidden bg-[#121212] flex items-center justify-center touch-none overscroll-none ${
          project.isLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        {/* Canvas background grid subtle lines when not tracing */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)] bg-[size:32px_32px] opacity-25 pointer-events-none" />

        {/* Real-time Zoom Percentage Indicator */}
        <div className="absolute top-4 left-4 z-20 bg-black/80 backdrop-blur-md border border-white/20 px-3 py-1.5 flex items-center gap-2 shadow-xl pointer-events-none">
          <ZoomIn size={14} className="text-amber-400" />
          <span className="font-mono text-xs font-bold text-white tracking-wider">
            {Math.round(project.transform.zoom * 100)}%
          </span>
          <span className="text-[10px] text-white/40 border-l border-white/20 pl-2">
            {project.transform.rotation}°
          </span>
        </div>

        {/* Render Image with Transformations & Adjustments */}
        <div
          style={{
            transform: `translate(${project.transform.panX}px, ${project.transform.panY}px) scale(${project.transform.zoom}) rotate(${project.transform.rotation}deg)`,
            transformOrigin: 'center center',
            opacity: project.adjustments.opacity / 100,
          }}
          className="relative transition-none select-none pointer-events-none"
        >
          <img
            src={processedUrl}
            alt="Workspace canvas"
            className="max-h-[82vh] max-w-[92vw] object-contain shadow-2xl border border-white/5 pointer-events-none"
            draggable={false}
          />
        </div>

        {/* OVERLAY TOOLS (Ruler, Protractor, Perspective) */}
        <OverlayTools
          ruler={project.overlays.showRuler ? project.overlays.rulerState : null}
          onUpdateRuler={(r) => updateOverlays({ ...project.overlays, rulerState: r })}
          protractor={project.overlays.showProtractor ? project.overlays.protractorState : null}
          onUpdateProtractor={(p) => updateOverlays({ ...project.overlays, protractorState: p })}
          perspective={project.overlays.showPerspective ? project.overlays.perspectiveState : null}
          onUpdatePerspective={(ps) => updateOverlays({ ...project.overlays, perspectiveState: ps })}
          isLocked={project.isLocked}
        />
      </main>

      {/* BOTTOM FLOATING STUDIO CONTROLS */}
      <footer
        className="z-30 bg-[#181818] border-t border-white/15 shadow-2xl"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {/* Active Tool Panel */}
        {activeBottomTab && (
          <div className="p-4 max-w-4xl mx-auto border-b border-white/10 bg-[#1a1a1a]">
            {/* 1. ADJUSTMENTS SLIDERS (Visible numeric values!) */}
            {activeBottomTab === 'adjustments' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <SlidersHorizontal size={14} /> Image Adjustments
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      className="px-2.5 py-1 text-[11px] font-black uppercase tracking-wider bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-500/30 flex items-center gap-1 transition-all"
                    >
                      <RotateCcw size={12} /> Reset All
                    </button>
                    {isProcessingFilter && (
                      <span className="text-xs text-white/60 animate-pulse">Processing edge filter...</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Opacity */}
                  <div className="bg-[#222222] border border-white/10 p-3">
                    <div className="flex justify-between items-center text-xs font-semibold text-white mb-1.5">
                      <span>Opacity</span>
                      <span className="font-mono bg-white/10 px-2 py-0.5 border border-white/20">
                        {project.adjustments.opacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={project.adjustments.opacity}
                      onChange={(e) => handleAdjustmentChange('opacity', Number(e.target.value))}
                      className="w-full accent-white cursor-pointer"
                    />
                  </div>

                  {/* Edge Detection Strength */}
                  <div className="bg-[#222222] border border-white/10 p-3">
                    <div className="flex justify-between items-center text-xs font-semibold text-white mb-1.5">
                      <span className="flex items-center gap-1 text-cyan-300">
                        Edge Detection Strength
                      </span>
                      <span className="font-mono bg-cyan-950/80 text-cyan-300 px-2 py-0.5 border border-cyan-400/40">
                        {project.adjustments.edgeDetection}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={project.adjustments.edgeDetection}
                      onChange={(e) => handleAdjustmentChange('edgeDetection', Number(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-white/40 mt-1">
                      <span>Original Photo</span>
                      <span>High-Contrast Outline</span>
                    </div>
                  </div>

                  {/* Brightness */}
                  <div className="bg-[#222222] border border-white/10 p-3">
                    <div className="flex justify-between items-center text-xs font-semibold text-white mb-1.5">
                      <span>Brightness</span>
                      <span className="font-mono bg-white/10 px-2 py-0.5 border border-white/20">
                        {project.adjustments.brightness > 0 ? '+' : ''}
                        {project.adjustments.brightness}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={project.adjustments.brightness}
                      onChange={(e) => handleAdjustmentChange('brightness', Number(e.target.value))}
                      className="w-full accent-white cursor-pointer"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="bg-[#222222] border border-white/10 p-3">
                    <div className="flex justify-between items-center text-xs font-semibold text-white mb-1.5">
                      <span>Contrast</span>
                      <span className="font-mono bg-white/10 px-2 py-0.5 border border-white/20">
                        {project.adjustments.contrast > 0 ? '+' : ''}
                        {project.adjustments.contrast}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={project.adjustments.contrast}
                      onChange={(e) => handleAdjustmentChange('contrast', Number(e.target.value))}
                      className="w-full accent-white cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. TRANSFORM CONTROLS (Zoom & Precise 0.1° Rotation) */}
            {activeBottomTab === 'transform' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                    {project.isLocked ? (
                      <span className="flex items-center gap-1 text-rose-400">
                        <Lock size={14} /> Locked (Unlock to Zoom/Rotate)
                      </span>
                    ) : (
                      'Zoom & Rotation Controls'
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      disabled={project.isLocked}
                      className="px-2.5 py-1 text-[11px] font-black uppercase tracking-wider bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-500/30 flex items-center gap-1 transition-all disabled:opacity-30"
                    >
                      <RotateCcw size={12} /> Reset All
                    </button>
                    <button
                      onClick={() => handleTransformChange(defaultTransform)}
                      disabled={project.isLocked}
                      className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white disabled:opacity-30"
                    >
                      <RefreshCw size={13} /> Reset View
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Zoom controls */}
                  <div className="bg-[#222222] border border-white/10 p-3">
                    <div className="flex justify-between items-center text-xs font-semibold text-white mb-2">
                      <span>Zoom Level (Max 5x)</span>
                      <span className="font-mono bg-white/10 px-2 py-0.5 border border-white/20">
                        {(project.transform.zoom * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTransformChange({ zoom: project.transform.zoom - 0.25 })}
                        disabled={project.isLocked || project.transform.zoom <= 0.2}
                        className="flex-1 bg-white/10 hover:bg-white/20 py-2.5 font-bold text-white flex items-center justify-center gap-1 disabled:opacity-30"
                      >
                        <ZoomOut size={16} /> -25%
                      </button>
                      <button
                        onClick={() => handleTransformChange({ zoom: project.transform.zoom + 0.25 })}
                        disabled={project.isLocked || project.transform.zoom >= 5.0}
                        className="flex-1 bg-white hover:bg-white/90 py-2.5 font-bold text-black flex items-center justify-center gap-1 disabled:opacity-30"
                      >
                        <ZoomIn size={16} /> +25%
                      </button>
                      <button
                        onClick={() => handleTransformChange({ zoom: 1.0 })}
                        disabled={project.isLocked}
                        className="bg-[#333] hover:bg-[#444] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-30"
                      >
                        100%
                      </button>
                    </div>
                  </div>

                  {/* Rotation controls (0.1° increments) */}
                  <div className="bg-[#222222] border border-white/10 p-3">
                    <div className="flex justify-between items-center text-xs font-semibold text-white mb-2">
                      <span>Rotation (Precise 0.1°)</span>
                      <span className="font-mono bg-white/10 px-2 py-0.5 border border-white/20">
                        {project.transform.rotation}°
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 mb-2">
                      <button
                        onClick={() => handleTransformChange({ rotation: project.transform.rotation - 90 })}
                        disabled={project.isLocked}
                        className="bg-white/10 hover:bg-white/20 py-2 text-xs font-bold text-white disabled:opacity-30"
                      >
                        -90°
                      </button>
                      <button
                        onClick={() => handleTransformChange({ rotation: project.transform.rotation - 0.1 })}
                        disabled={project.isLocked}
                        className="bg-white/10 hover:bg-white/20 py-2 text-xs font-bold text-amber-300 disabled:opacity-30 flex items-center justify-center gap-1"
                      >
                        <RotateCcw size={12} /> -0.1°
                      </button>
                      <button
                        onClick={() => handleTransformChange({ rotation: project.transform.rotation + 0.1 })}
                        disabled={project.isLocked}
                        className="bg-white/10 hover:bg-white/20 py-2 text-xs font-bold text-amber-300 disabled:opacity-30 flex items-center justify-center gap-1"
                      >
                        <RotateCw size={12} /> +0.1°
                      </button>
                      <button
                        onClick={() => handleTransformChange({ rotation: project.transform.rotation + 90 })}
                        disabled={project.isLocked}
                        className="bg-white/10 hover:bg-white/20 py-2 text-xs font-bold text-white disabled:opacity-30"
                      >
                        +90°
                      </button>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="0.1"
                      value={project.transform.rotation}
                      disabled={project.isLocked}
                      onChange={(e) => handleTransformChange({ rotation: Number(e.target.value) })}
                      className="w-full accent-white cursor-pointer disabled:opacity-30"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. OVERLAYS PANEL (Ruler, Protractor, Perspective) */}
            {activeBottomTab === 'tools' && (
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Geometry & Tracing Overlays
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Ruler */}
                  <button
                    onClick={() =>
                      updateOverlays({ ...project.overlays, showRuler: !project.overlays.showRuler })
                    }
                    className={`flex items-center justify-between p-3.5 border transition-all ${
                      project.overlays.showRuler
                        ? 'bg-amber-900/40 border-amber-400 text-white'
                        : 'bg-[#222222] border-white/10 text-white/70 hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 font-bold text-sm">
                      <Ruler size={18} className={project.overlays.showRuler ? 'text-amber-400' : ''} />
                      <span>Ruler (cm)</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase bg-white/10 px-2 py-0.5">
                      {project.overlays.showRuler ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  {/* Protractor */}
                  <button
                    onClick={() =>
                      updateOverlays({
                        ...project.overlays,
                        showProtractor: !project.overlays.showProtractor,
                      })
                    }
                    className={`flex items-center justify-between p-3.5 border transition-all ${
                      project.overlays.showProtractor
                        ? 'bg-emerald-900/40 border-emerald-400 text-white'
                        : 'bg-[#222222] border-white/10 text-white/70 hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 font-bold text-sm">
                      <Compass size={18} className={project.overlays.showProtractor ? 'text-emerald-400' : ''} />
                      <span>Protractor (°)</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase bg-white/10 px-2 py-0.5">
                      {project.overlays.showProtractor ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  {/* Perspective Guide */}
                  <button
                    onClick={() =>
                      updateOverlays({
                        ...project.overlays,
                        showPerspective: !project.overlays.showPerspective,
                      })
                    }
                    className={`flex items-center justify-between p-3.5 border transition-all ${
                      project.overlays.showPerspective
                        ? 'bg-cyan-900/40 border-cyan-400 text-white'
                        : 'bg-[#222222] border-white/10 text-white/70 hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 font-bold text-sm">
                      <Grid size={18} className={project.overlays.showPerspective ? 'text-cyan-400' : ''} />
                      <span>1-Point Perspective</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase bg-white/10 px-2 py-0.5">
                      {project.overlays.showPerspective ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Selector Bar */}
        <div className="flex items-center justify-center max-w-md mx-auto divide-x divide-white/10 py-1.5">
          <button
            onClick={() => setActiveBottomTab(activeBottomTab === 'adjustments' ? null : 'adjustments')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeBottomTab === 'adjustments' ? 'text-white bg-white/10' : 'text-white/50 hover:text-white'
            }`}
          >
            <Sliders size={15} /> Sliders
          </button>
          <button
            onClick={() => setActiveBottomTab(activeBottomTab === 'transform' ? null : 'transform')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeBottomTab === 'transform' ? 'text-white bg-white/10' : 'text-white/50 hover:text-white'
            }`}
          >
            <RotateCw size={15} /> Transform
          </button>
          <button
            onClick={() => setActiveBottomTab(activeBottomTab === 'tools' ? null : 'tools')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeBottomTab === 'tools' ? 'text-white bg-white/10' : 'text-white/50 hover:text-white'
            }`}
          >
            <Ruler size={15} /> Overlays
          </button>
        </div>
      </footer>

      {/* RESET ALL CONFIRMATION DIALOG */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
          <div className="w-full max-w-sm bg-[#1a1a1a] border border-white/20 p-6 shadow-2xl rounded-none">
            <h3 className="text-base font-bold text-white mb-2 uppercase tracking-wide">
              Reset all image adjustments?
            </h3>
            <p className="text-xs text-white/60 mb-6">
              This will immediately restore brightness, contrast, opacity, edge strength, rotation, zoom, and image positioning back to their original default values.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 bg-[#2a2a2a] border border-white/10 hover:bg-[#333] text-xs font-bold uppercase tracking-wider text-white rounded-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAll}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-xs font-bold uppercase tracking-wider text-white shadow-lg rounded-none cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
