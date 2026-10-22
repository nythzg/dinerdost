"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ExploreHeader({
  account,
  arranging,
  children,
}: {
  account: string;
  arranging: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null),
    selectedHeight = useRef<number | null>(null),
    drag = useRef<{ y: number; height: number } | null>(null);
  const [height, setHeight] = useState<number | null>(null),
    [measured, setMeasured] = useState(68);
  const key =
      "dd-explore-controls-" + account + (arranging ? "-arrange" : "-view"),
    max = () => Math.max(68, Math.min(320, window.innerHeight * 0.45));
  const apply = (value: number) => {
    const next = Math.round(Math.max(68, Math.min(max(), value)));
    selectedHeight.current = next;
    setHeight(next);
    return next;
  };
  useEffect(() => {
    const stored = Number(localStorage.getItem(key));
    if (stored >= 68) apply(stored);
    const observer = new ResizeObserver(() =>
      setMeasured(
        Math.round(panel.current?.getBoundingClientRect().height ?? 68),
      ),
    );
    if (panel.current) observer.observe(panel.current);
    return () => observer.disconnect();
  }, [key]);
  return (
    <div
      className="explore-header"
      ref={panel}
      style={height === null ? undefined : { height }}
    >
      <div className="explore-header-content">{children}</div>
      <div
        className="explore-header-edge"
        role="separator"
        aria-label="Resize Explore controls"
        aria-orientation="horizontal"
        tabIndex={0}
        aria-valuemin={68}
        aria-valuemax={320}
        aria-valuenow={measured}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          drag.current = {
            y: e.clientY,
            height: panel.current!.getBoundingClientRect().height,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            apply(drag.current.height + e.clientY - drag.current.y);
        }}
        onPointerUp={() => {
          if (drag.current) {
            localStorage.setItem(
              key,
              String(panel.current!.getBoundingClientRect().height),
            );
            drag.current = null;
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setHeight(null);
            selectedHeight.current = null;
            localStorage.removeItem(key);
            return;
          }
          const current =
            selectedHeight.current ??
            panel.current!.getBoundingClientRect().height;
          const next =
            e.key === "ArrowUp"
              ? current - 10
              : e.key === "ArrowDown"
                ? current + 10
                : e.key === "Home"
                  ? 68
                  : e.key === "End"
                    ? max()
                    : null;
          if (next !== null) {
            e.preventDefault();
            localStorage.setItem(key, String(apply(next)));
          }
        }}
      >
        <span />
      </div>
    </div>
  );
}
