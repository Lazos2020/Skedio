import React, { useRef, useState, useCallback, useEffect } from 'react';

interface DragScrollProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Which surface the row sits on, so the overflow fade edges blend into the
   * correct background in both dark and light themes. Use 'card' inside
   * cards/panels and 'page' on the base app background.
   */
  fade?: 'page' | 'card' | 'none';
}

/**
 * Reusable horizontal scroll container used for EVERY category / tab row in
 * Skedio. It supports:
 *  - native touch swipe (overflow-x-auto) with momentum on phones/tablets
 *  - mouse click-and-drag to scroll on desktop
 *  - vertical mouse-wheel translated into horizontal scroll on desktop
 *  - subtle left/right fade indicators when more content exists off-screen
 *
 * Drag only activates for mouse (pointerType === 'mouse') so touch scrolling
 * keeps its native feel.
 */
export const DragScroll: React.FC<DragScrollProps> = ({
  children,
  className = '',
  fade = 'page',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setEdges({
      left: el.scrollLeft > 1,
      right: el.scrollLeft < maxScroll - 1,
    });
  }, []);

  // Recompute fade visibility on mount, on content/size changes, and resize.
  useEffect(() => {
    updateEdges();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateEdges, children]);

  // Non-passive wheel listener so we can translate vertical wheel -> horizontal
  // scroll and preventDefault the page scroll while hovering the row.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
        updateEdges();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [updateEdges]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    drag.current = {
      active: true,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
    updateEdges();
  };

  const endDrag = () => {
    drag.current.active = false;
  };

  // Prevent a drag from also firing a click on the child that was under the cursor.
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  const fadeColor =
    fade === 'card' ? 'var(--skedio-fade-card)' : 'var(--skedio-fade-page)';

  return (
    <div className="relative">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        onScroll={updateEdges}
        className={`no-scrollbar overflow-x-auto overscroll-x-contain [scroll-behavior:smooth] cursor-grab active:cursor-grabbing touch-pan-x ${className}`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>

      {fade !== 'none' && edges.left && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-8 z-10"
          style={{ background: `linear-gradient(to right, ${fadeColor}, transparent)` }}
        />
      )}
      {fade !== 'none' && edges.right && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 z-10"
          style={{ background: `linear-gradient(to left, ${fadeColor}, transparent)` }}
        />
      )}
    </div>
  );
};
