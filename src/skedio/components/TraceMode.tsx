import React, { useEffect, useState, useRef } from 'react';
import { Lock, Unlock, ShieldAlert, Power, ZoomIn } from 'lucide-react';
import { Project } from '../types';
import { loadSettings } from '../lib/settings';

interface TraceModeProps {
  project: Project;
  processedImageUrl: string;
  onExitTraceMode: () => void;
}

export const TraceMode: React.FC<TraceModeProps> = ({
  project,
  processedImageUrl,
  onExitTraceMode,
}) => {
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [showExitHint, setShowExitHint] = useState(true);
  const [batteryLowWarning, setBatteryLowWarning] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  // 1. Keep Screen Awake, Orientation Lock, Full Screen & Battery Check
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    let batteryInstance: any = null;
    const settings = loadSettings();

    const requestWakeLock = async () => {
      try {
        if (settings.keepScreenAwake && 'wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
          setWakeLockActive(true);
          wakeLock.addEventListener('release', () => {
            setWakeLockActive(false);
          });
        }
      } catch (err) {
        console.warn('WakeLock request failed:', err);
      }
    };

    requestWakeLock();

    // Re-acquire the wake lock when returning to the tab (browsers auto-release
    // it on visibility loss). Only if the user enabled Keep Screen Awake.
    const handleWakeRevisibility = () => {
      if (settings.keepScreenAwake && document.visibilityState === 'visible' && !wakeLock) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleWakeRevisibility);

    // Check battery API
    let updateBatteryStatus: (() => void) | null = null;
    const checkBattery = async () => {
      try {
        if ('getBattery' in navigator) {
          batteryInstance = await (navigator as any).getBattery();
          updateBatteryStatus = () => {
            if (!batteryInstance.charging && batteryInstance.level < 0.15) {
              setBatteryLowWarning(true);
            } else {
              setBatteryLowWarning(false);
            }
          };
          updateBatteryStatus();
          batteryInstance.addEventListener('levelchange', updateBatteryStatus);
          batteryInstance.addEventListener('chargingchange', updateBatteryStatus);
        }
      } catch {
        // Ignore if unsupported
      }
    };
    checkBattery();

    // Request full screen
    const enterFullscreen = async () => {
      try {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if ((docEl as any).webkitRequestFullscreen) {
          await (docEl as any).webkitRequestFullscreen();
        }
      } catch (err) {
        console.warn('Fullscreen entry failed:', err);
      }
    };
    enterFullscreen();

    // Trace Mode Orientation setting: follow device (no lock), portrait, or
    // landscape. Applied only while Trace Mode is active.
    try {
      if (screen.orientation && 'lock' in screen.orientation && settings.traceOrientation !== 'follow') {
        const target =
          settings.traceOrientation === 'portrait' ? 'portrait' : 'landscape';
        (screen.orientation as any).lock(target).catch(() => {
          // Ignore unsupported orientation lock
        });
      }
    } catch {
      // Ignore
    }

    // Hide initial instruction hint after 4.5 seconds
    const hintTimer = setTimeout(() => {
      setShowExitHint(false);
    }, 4500);

    // 2. Power Button Return Unlock Detection via visibilitychange
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onExitTraceMode();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(hintTimer);
      document.removeEventListener('visibilitychange', handleWakeRevisibility);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
      if (batteryInstance && updateBatteryStatus) {
        batteryInstance.removeEventListener('levelchange', updateBatteryStatus);
        batteryInstance.removeEventListener('chargingchange', updateBatteryStatus);
      }
      // Exit fullscreen
      const exitFullscreen = async () => {
        try {
          if (document.fullscreenElement) {
            if (document.exitFullscreen) {
              await document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
              await (document as any).webkitExitFullscreen();
            }
          }
        } catch (err) {
          console.warn('Fullscreen exit failed:', err);
        }
      };
      exitFullscreen();

      try {
        if (screen.orientation && 'unlock' in screen.orientation) {
          screen.orientation.unlock();
        }
      } catch {}
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onExitTraceMode]);

  // Handle discreet desktop / iframe fallback 3-second long press to unlock
  const handlePointerDown = () => {
    setLongPressProgress(0);
    const startTime = Date.now();
    const duration = 2500; // 2.5s hold

    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setLongPressProgress(pct);
    }, 50);

    longPressTimerRef.current = window.setTimeout(() => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      onExitTraceMode();
    }, duration);
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setLongPressProgress(0);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#121212] overflow-hidden select-none touch-none overscroll-none">
      {/* Real-time Zoom Percentage Indicator */}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] z-50 bg-black/80 backdrop-blur-md border border-white/20 px-3 py-1.5 flex items-center gap-2 shadow-xl pointer-events-none">
        <ZoomIn size={14} className="text-amber-400" />
        <span className="font-mono text-xs font-bold text-white tracking-wider">
          {Math.round(project.transform.zoom * 100)}%
        </span>
      </div>

      {/* FIXED TRACING CANVAS AREA (Pointer events disabled on image so tracing hand touch won't shift) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div
          style={{
            transform: `translate(${project.transform.panX}px, ${project.transform.panY}px) scale(${project.transform.zoom}) rotate(${project.transform.rotation}deg)`,
            transformOrigin: 'center center',
            opacity: project.adjustments.opacity / 100,
          }}
          className="transition-none pointer-events-none"
        >
          <img
            src={processedImageUrl || project.imageDataUrl}
            alt="Tracing target"
            className="max-h-[90vh] max-w-[90vw] object-contain pointer-events-none select-none"
            draggable={false}
          />
        </div>
      </div>

      {/* INSTRUCTIONS BADGE (Auto-hides after 4.5s) */}
      {showExitHint && (
        <div className="absolute top-[max(1.5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-fade-in">
          <div className="bg-black/90 border border-white/20 px-5 py-3 text-white text-center shadow-2xl backdrop-blur-md max-w-sm">
            <div className="flex items-center justify-center gap-2 text-rose-400 font-bold text-sm uppercase tracking-wider mb-1">
              <Lock size={16} />
              <span>Trace Mode Active</span>
            </div>
            <p className="text-xs text-white/80 leading-relaxed">
              Screen stays awake & touch interactions disabled. Place paper over device to trace.
            </p>
            <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-center gap-2 text-[11px] font-semibold text-amber-300">
              <Power size={13} />
              <span>Press Power button once & wake, or hold top-right pad to unlock.</span>
            </div>
          </div>
        </div>
      )}

      {/* BATTERY LOW WARNING (< 15%) */}
      {batteryLowWarning && (
        <div className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-bounce">
          <div className="bg-rose-950/95 border border-rose-500 px-4 py-2.5 text-rose-200 text-xs font-bold shadow-2xl flex items-center gap-2 max-w-md">
            <ShieldAlert size={18} className="text-rose-400 shrink-0" />
            <span>Battery below 15%! Device may shut down and interrupt tracing. Please connect a charger.</span>
          </div>
        </div>
      )}

      {/* DISCREET UNLOCK CORNER TRIGGER (Top-Right) */}
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-50 h-14 w-14 flex items-center justify-center cursor-pointer group"
        title="Hold 2.5 seconds to exit Trace Mode"
      >
        <div className="relative flex h-10 w-10 items-center justify-center rounded-none bg-black/40 border border-white/10 text-white/40 group-hover:text-white group-hover:border-white/40 transition-all">
          {longPressProgress > 0 ? (
            <div className="flex flex-col items-center">
              <Unlock size={18} className="text-rose-400 animate-pulse" />
              <span className="text-[9px] font-mono font-bold text-rose-300">
                {Math.round(longPressProgress)}%
              </span>
            </div>
          ) : (
            <Lock size={18} />
          )}

          {/* Progress fill */}
          {longPressProgress > 0 && (
            <div
              className="absolute bottom-0 left-0 right-0 bg-rose-600/40 transition-all"
              style={{ height: `${longPressProgress}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
