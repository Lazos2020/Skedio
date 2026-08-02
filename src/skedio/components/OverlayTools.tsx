import React, { useState } from 'react';
import { RulerState, ProtractorState, PerspectiveState } from '../types';
import { RotateCw, Move, Plus, Minus } from 'lucide-react';

interface OverlayToolsProps {
  ruler: RulerState | null;
  onUpdateRuler?: (ruler: RulerState) => void;
  protractor: ProtractorState | null;
  onUpdateProtractor?: (protractor: ProtractorState) => void;
  perspective: PerspectiveState | null;
  onUpdatePerspective?: (perspective: PerspectiveState) => void;
  isLocked?: boolean;
}

export const OverlayTools: React.FC<OverlayToolsProps> = ({
  ruler,
  onUpdateRuler,
  protractor,
  onUpdateProtractor,
  perspective,
  onUpdatePerspective,
  isLocked = false,
}) => {
  const [draggingTool, setDraggingTool] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle pointer down for dragging overlays
  const handlePointerDown = (toolName: string, e: React.PointerEvent, currentX: number, currentY: number) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingTool(toolName);
    setDragOffset({ x: e.clientX - currentX, y: e.clientY - currentY });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingTool) return;
    e.stopPropagation();
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    if (draggingTool === 'ruler' && ruler && onUpdateRuler) {
      onUpdateRuler({ ...ruler, x: newX, y: newY });
    } else if (draggingTool === 'protractor' && protractor && onUpdateProtractor) {
      onUpdateProtractor({ ...protractor, x: newX, y: newY });
    } else if (draggingTool === 'perspective' && perspective && onUpdatePerspective) {
      onUpdatePerspective({ ...perspective, vpX: newX, vpY: newY });
    } else if (draggingTool === 'horizon' && perspective && onUpdatePerspective) {
      onUpdatePerspective({ ...perspective, horizonY: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingTool) {
      e.stopPropagation();
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture already released
      }
      setDraggingTool(null);
    }
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* 1-POINT PERSPECTIVE GUIDE OVERLAY */}
      {perspective && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Horizon Line */}
          <div
            style={{ top: `${perspective.horizonY}px` }}
            className="absolute left-0 right-0 h-0.5 bg-cyan-400/80 shadow-[0_0_8px_rgba(34,211,238,0.8)] pointer-events-auto cursor-ns-resize touch-none flex items-center justify-between px-4"
            onPointerDown={(e) => handlePointerDown('horizon', e, 0, perspective.horizonY)}
          >
            <span className="bg-cyan-950/90 text-cyan-300 text-[10px] font-mono px-2 py-0.5 border border-cyan-400/40">
              Horizon Line (Drag vertically)
            </span>
          </div>

          {/* Radiating Rays */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {Array.from({ length: perspective.rayCount * 2 }).map((_, i) => {
              const angle = (i * Math.PI) / perspective.rayCount;
              const len = 3000;
              const x2 = perspective.vpX + Math.cos(angle) * len;
              const y2 = perspective.vpY + Math.sin(angle) * len;
              return (
                <line
                  key={i}
                  x1={perspective.vpX}
                  y1={perspective.vpY}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(34, 211, 238, 0.35)"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                />
              );
            })}
          </svg>

          {/* Vanishing Point Handle */}
          <div
            style={{ left: `${perspective.vpX}px`, top: `${perspective.vpY}px` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-auto cursor-move touch-none group"
            onPointerDown={(e) => handlePointerDown('perspective', e, perspective.vpX, perspective.vpY)}
          >
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.8)] group-hover:scale-125 transition-transform">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-300 animate-ping" />
            </div>
            <span className="absolute top-9 bg-cyan-950 text-cyan-300 text-[10px] font-mono px-2 py-0.5 border border-cyan-400/40 whitespace-nowrap">
              Vanishing Point (VP)
            </span>
          </div>
        </div>
      )}

      {/* RULER (Centimeters) */}
      {ruler && (
        <div
          style={{
            left: `${ruler.x}px`,
            top: `${ruler.y}px`,
            transform: `rotate(${ruler.rotation}deg)`,
          }}
          className="absolute pointer-events-auto origin-center select-none touch-none shadow-2xl transition-transform"
          onPointerDown={(e) => handlePointerDown('ruler', e, ruler.x, ruler.y)}
          onDoubleClick={() => {
            if (onUpdateRuler) {
              const nextRot = (ruler.rotation + 45) % 360;
              onUpdateRuler({ ...ruler, rotation: nextRot });
            }
          }}
        >
          <div className="bg-amber-100/95 border-2 border-amber-900/80 text-amber-950 h-16 flex flex-col justify-between shadow-[0_10px_25px_rgba(0,0,0,0.6)] cursor-move">
            {/* Top CM scale */}
            <div className="flex h-6 border-b border-amber-900/40">
              {Array.from({ length: ruler.lengthCm + 1 }).map((_, cm) => (
                <div
                  key={cm}
                  style={{ width: `${ruler.ppi / 2.54}px` }}
                  className="relative flex flex-col justify-start border-l-2 border-amber-900 shrink-0"
                >
                  <span className="text-[10px] font-bold font-mono pl-1 -mt-0.5">{cm}cm</span>
                  {/* Millimeter ticks */}
                  {cm < ruler.lengthCm && (
                    <div className="absolute top-0 left-0 right-0 flex justify-between h-2.5 pt-3">
                      {Array.from({ length: 9 }).map((_, mm) => (
                        <div
                          key={mm}
                          className={`w-px bg-amber-900/60 ${mm === 4 ? 'h-3 bg-amber-900' : 'h-1.5'}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom handle & rotate indicator */}
            <div className="flex items-center justify-between px-3 pb-1 text-[10px] font-semibold text-amber-900/80">
              <span className="flex items-center gap-1">
                <Move size={12} /> Drag ruler • Dbl-tap edge to rotate ({ruler.rotation}°)
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onUpdateRuler) {
                    onUpdateRuler({ ...ruler, rotation: (ruler.rotation + 15) % 360 });
                  }
                }}
                className="p-1 hover:bg-amber-200/50 flex items-center gap-1 font-bold"
              >
                <RotateCw size={12} /> Rotate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROTRACTOR (Angles) */}
      {protractor && (
        <div
          style={{
            left: `${protractor.x}px`,
            top: `${protractor.y}px`,
            transform: `rotate(${protractor.rotation}deg)`,
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto origin-center select-none touch-none shadow-2xl"
          onPointerDown={(e) => handlePointerDown('protractor', e, protractor.x, protractor.y)}
          onDoubleClick={() => {
            if (onUpdateProtractor) {
              onUpdateProtractor({ ...protractor, rotation: (protractor.rotation + 45) % 360 });
            }
          }}
        >
          <div
            style={{ width: `${protractor.radius * 2}px`, height: `${protractor.radius}px` }}
            className="rounded-t-full bg-emerald-500/20 border-2 border-emerald-400 backdrop-blur-sm flex flex-col items-center justify-end relative cursor-move overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.3)]"
          >
            {/* Angle tick marks */}
            <div className="absolute inset-0">
              {Array.from({ length: 19 }).map((_, idx) => {
                const deg = idx * 10;
                const rad = (deg * Math.PI) / 180;
                return (
                  <div
                    key={deg}
                    style={{
                      transformOrigin: 'bottom center',
                      transform: `rotate(${deg - 90}deg)`,
                    }}
                    className="absolute bottom-0 left-1/2 w-0.5 h-full pointer-events-none"
                  >
                    <div className={`w-full bg-emerald-300 ${deg % 30 === 0 ? 'h-5' : 'h-2.5'}`} />
                  </div>
                );
              })}
            </div>

            <div className="z-10 bg-emerald-950/90 border border-emerald-400/50 px-2.5 py-1 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2 mb-2">
              <span>Protractor ({protractor.rotation}°)</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onUpdateProtractor) {
                    onUpdateProtractor({ ...protractor, rotation: (protractor.rotation + 15) % 360 });
                  }
                }}
                className="p-0.5 hover:text-white"
              >
                <RotateCw size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
