"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types for Rendr geometry JSON blob
// ---------------------------------------------------------------------------

interface Point2D { 0: number; 1: number; }

interface ChildSurface {
  id: string;
  label: string;
  category: string;
  rawSize: [number, number];
  rect: [[number, number], [number, number]];
}

interface RendrWall {
  id: string;
  label: string;
  points: [Point2D, Point2D];
  rawSize: [number, number]; // [width, height] in meters
  childSurfaces?: ChildSurface[];
}

interface RendrRoom {
  id: string;
  label: string;
  area: number;
  perimeter: number;
  points: Point2D[];
}

interface RendrObject {
  id: string;
  displayName: string;
  center: Point2D;
  renderedSize: [number, number];
  rotation?: number;
}

interface RendrGeometry {
  space: {
    title: string;
    walls: RendrWall[];
    doors: { id: string; label: string; points: [Point2D, Point2D]; rawSize: [number, number] }[];
    windows: { id: string; label: string; points: [Point2D, Point2D]; rawSize: [number, number] }[];
    openings: { id: string; label: string; points: [Point2D, Point2D]; rawSize: [number, number] }[];
    rooms: RendrRoom[];
    objects: RendrObject[];
    floorBounds: [Point2D, Point2D];
    squareFootage?: number;
    perimeterInFeet?: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const M_TO_FT = 3.28084;
const SCALE = 100;
const WALL_T = 0.08; // wall half-thickness in meters (total wall = 0.16m ≈ 6")

/** Convert decimal feet to feet'inches" format */
function feetToFtIn(ft: number): string {
  const totalInches = Math.round(ft * 12);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches === 0 ? `${feet}'` : `${feet}' ${inches}"`;
}

/** Get perpendicular normal for a wall segment */
function wallNormal(p1: Point2D, p2: Point2D): { nx: number; ny: number; len: number } {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return { nx: 0, ny: 0, len: 0 };
  return { nx: -dy / len, ny: dx / len, len };
}

/** Angle of line from p1 to p2 in degrees */
function lineAngle(p1: Point2D, p2: Point2D): number {
  return Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * (180 / Math.PI);
}

// ---------------------------------------------------------------------------
// Colors matching Rendr's style
// ---------------------------------------------------------------------------

const C = {
  bg: "#ffffff",
  wallFill: "#c4cad3",    // medium gray (matches Rendr)
  wallStroke: "#9ca3af",  // gray-400 border
  roomFill: "#f0f5ff",    // very light blue tint
  roomStroke: "#93c5fd",  // blue-300
  door: "#f97316",        // orange
  window: "#3b82f6",      // blue
  opening: "#94a3b8",     // gray dashed
  objFill: "#6b7280",     // gray-500 (solid dark like Rendr)
  objStroke: "#4b5563",   // gray-600
  label: "#1e293b",       // slate-800
  dimLine: "#93c5fd",     // blue-300
  dimText: "#3b82f6",     // blue-500
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InteractiveFloorPlan({ spaceId }: { spaceId: number }) {
  const [geometry, setGeometry] = useState<RendrGeometry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showLabels, setShowLabels] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [expandedWallId, setExpandedWallId] = useState<string | null>(null);
  const elevationsRef = useRef<HTMLDivElement>(null);
  const [showObjects, setShowObjects] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setLoading(true);
    fetch(`/api/rendr/spaces/${spaceId}/geometry`)
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setGeometry(d); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [spaceId]);

  const handleWallClick = useCallback((wallId: string) => {
    setExpandedWallId((prev) => prev === wallId ? null : wallId);
    // Scroll to the specific wall elevation
    setTimeout(() => {
      const el = document.getElementById(`wall-elev-${wallId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) setPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  if (loading) return (
    <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" /> Loading floor plan...
    </div>
  );

  if (error || !geometry?.space) return (
    <div className="py-12 text-center"><p className="text-sm text-zinc-500">{error || "No floor plan data."}</p></div>
  );

  const { space } = geometry;
  const bounds = space.floorBounds;
  if (!bounds) return <div className="py-12 text-center text-sm text-zinc-500">No floor bounds.</div>;

  // SVG Y-axis goes down, Rendr scan Y-axis goes up.
  // Don't flip — raw coords already place Kitchen (negative Y) at top of SVG.
  const pad = 1.5;
  const minX = bounds[0][0] - pad;
  const maxX = bounds[1][0] + pad;
  const minY = bounds[0][1] - pad;
  const maxY = bounds[1][1] + pad;
  const vw = (maxX - minX) * SCALE;
  const vh = (maxY - minY) * SCALE;

  /** Convert point to SVG coords — no flip needed. */
  const sx = (p: Point2D) => p[0] * SCALE;
  const sy = (p: Point2D) => p[1] * SCALE;

  return (
    <div>
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">100%</span>
          <input
            type="range"
            min={100}
            max={250}
            step={1}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-orange-500 dark:bg-zinc-700"
            list="zoom-stops"
          />
          <datalist id="zoom-stops">
            <option value="100" />
            <option value="125" />
            <option value="150" />
            <option value="175" />
            <option value="200" />
            <option value="225" />
            <option value="250" />
          </datalist>
          <span className="min-w-[3rem] text-center text-xs font-medium text-zinc-600 dark:text-zinc-400">{Math.round(zoom * 100)}%</span>
          <button onClick={resetView} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400">1:1</button>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-500" /> Labels
          </label>
          <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={showMeasurements} onChange={(e) => setShowMeasurements(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-500" /> Measurements
          </label>
          <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={showObjects} onChange={(e) => setShowObjects(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-500" /> Furniture
          </label>
        </div>
      </div>

      {/* SVG */}
      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700"
        style={{ height: "560px", cursor: isPanning ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          width="100%" height="100%"
          viewBox={`${minX * SCALE} ${minY * SCALE} ${vw} ${vh}`}
          style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: "center" }}
        >
          <rect x={minX * SCALE} y={minY * SCALE} width={vw} height={vh} fill={C.bg} />

          {/* Clip path from the "All Rooms" boundary so objects don't bleed outside */}
          <defs>
            {(() => {
              const allRooms = space.rooms.find((r) => r.label === "All Rooms");
              if (!allRooms) return null;
              return (
                <clipPath id="room-clip">
                  <polygon points={allRooms.points.map((p) => `${sx(p)},${sy(p)}`).join(" ")} />
                </clipPath>
              );
            })()}
          </defs>

          {/* Room fills (skip "All Rooms" summary pseudo-room) */}
          {space.rooms.filter((r) => r.label !== "All Rooms").map((room) => {
            const pts = room.points.map((p) => `${sx(p)},${sy(p)}`).join(" ");
            const cx = room.points.reduce((s, p) => s + sx(p), 0) / room.points.length;
            const cy = room.points.reduce((s, p) => s + sy(p), 0) / room.points.length;
            return (
              <g key={room.id}>
                <polygon points={pts} fill={C.roomFill} stroke={C.roomStroke} strokeWidth={1} />
                {showLabels && (
                  <g>
                    <rect x={cx - 45} y={cy - 12} width={90} height={24} rx={5} fill="white" fillOpacity={0.9} stroke={C.roomStroke} strokeWidth={0.5} />
                    <text x={cx} y={cy + 5} textAnchor="middle" fontSize={14} fontWeight="600" fill={C.label} fontFamily="system-ui">{room.label}</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Walls — thin styled lines matching Rendr */}
          {space.walls.map((wall) => {
            const p1 = wall.points[0];
            const p2 = wall.points[1];
            const { nx, ny, len } = wallNormal(p1, p2);
            if (len < 0.01) return null;
            const t = WALL_T;

            // Wall polygon (thin rectangle)
            const pts = [
              `${(p1[0] + nx * t) * SCALE},${(p1[1] + ny * t) * SCALE}`,
              `${(p2[0] + nx * t) * SCALE},${(p2[1] + ny * t) * SCALE}`,
              `${(p2[0] - nx * t) * SCALE},${(p2[1] - ny * t) * SCALE}`,
              `${(p1[0] - nx * t) * SCALE},${(p1[1] - ny * t) * SCALE}`,
            ].join(" ");

            // Dimension line offset — push further outside the wall
            const offX = nx * 0.7 * SCALE;
            const offY = ny * 0.7 * SCALE;
            const mx = (sx(p1) + sx(p2)) / 2;
            const my = (sy(p1) + sy(p2)) / 2;
            const lengthFt = len * M_TO_FT;
            const angle = lineAngle(
              { 0: sx(p1), 1: sy(p1) } as Point2D,
              { 0: sx(p2), 1: sy(p2) } as Point2D,
            );
            // Keep text readable (not upside down)
            const textAngle = angle > 90 || angle < -90 ? angle + 180 : angle;

            return (
              <g key={wall.id}>
                <polygon points={pts} fill={C.wallFill} stroke={C.wallStroke} strokeWidth={1} />

                {showMeasurements && lengthFt > 2 && (
                  <g>
                    {/* Dimension line */}
                    <line
                      x1={sx(p1) + offX} y1={sy(p1) + offY}
                      x2={sx(p2) + offX} y2={sy(p2) + offY}
                      stroke={C.dimLine} strokeWidth={0.8}
                    />
                    {/* End ticks */}
                    <circle cx={sx(p1) + offX} cy={sy(p1) + offY} r={2} fill={C.dimLine} />
                    <circle cx={sx(p2) + offX} cy={sy(p2) + offY} r={2} fill={C.dimLine} />
                    {/* Dimension text */}
                    <text
                      x={mx + offX} y={my + offY - 6}
                      textAnchor="middle"
                      fontSize={13}
                      fontWeight="700"
                      fill={C.dimText}
                      fontFamily="system-ui"
                      transform={`rotate(${textAngle}, ${mx + offX}, ${my + offY - 6})`}
                    >
                      {feetToFtIn(lengthFt)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Doors — orange lines (geometry only) */}
          {space.doors.map((door) => (
            <line key={door.id}
              x1={sx(door.points[0])} y1={sy(door.points[0])}
              x2={sx(door.points[1])} y2={sy(door.points[1])}
              stroke={C.door} strokeWidth={3} strokeLinecap="round"
            />
          ))}

          {/* Windows — blue lines (geometry only) */}
          {space.windows.map((win) => (
            <line key={win.id}
              x1={sx(win.points[0])} y1={sy(win.points[0])}
              x2={sx(win.points[1])} y2={sy(win.points[1])}
              stroke={C.window} strokeWidth={4} strokeLinecap="round"
            />
          ))}

          {/* Openings — dashed gray (geometry only) */}
          {(space.openings || []).map((op) => (
            <line key={op.id}
              x1={sx(op.points[0])} y1={sy(op.points[0])}
              x2={sx(op.points[1])} y2={sy(op.points[1])}
              stroke={C.opening} strokeWidth={2} strokeDasharray="6,4" strokeLinecap="round"
            />
          ))}

          {/* Objects (furniture) — clipped to room boundary, solid gray like Rendr */}
          {showObjects && (
            <g clipPath="url(#room-clip)">
              {space.objects.map((obj) => {
                const cx = sx(obj.center);
                const cy = sy(obj.center);
                // Snap objects to nearest wall axis (0° or 90°)
                // Determine if object should be rotated 90° based on which
                // wall it's closest to (horizontal vs vertical)
                const rot = obj.rotation ?? 0;
                const absDeg = Math.abs(rot * (180 / Math.PI)) % 180;
                // If rotation is closer to 45-135°, swap width/height (object runs vertically)
                const isVertical = absDeg > 30 && absDeg < 150;
                const ow = (obj.renderedSize?.[0] ?? 0.3) * SCALE;
                const oh = (obj.renderedSize?.[1] ?? 0.3) * SCALE;
                const w = isVertical ? oh : ow;
                const h = isVertical ? ow : oh;
                return (
                  <rect
                    key={obj.id}
                    x={cx - w / 2} y={cy - h / 2} width={w} height={h}
                    fill={C.objFill} fillOpacity={0.75} stroke={C.objStroke} strokeWidth={0.5} rx={2}
                  />
                );
              })}
            </g>
          )}

          {/* ═══ ALL LABELS — rendered last so they appear on top ═══ */}
          {showLabels && (
            <g>
              {/* Door labels */}
              {space.doors.map((door) => {
                const dmx = (sx(door.points[0]) + sx(door.points[1])) / 2;
                const dmy = (sy(door.points[0]) + sy(door.points[1])) / 2;
                return (
                  <g key={`dl-${door.id}`}>
                    <rect x={dmx - 18} y={dmy - 10} width={36} height={20} rx={4} fill="white" fillOpacity={0.95} stroke={C.door} strokeWidth={0.8} />
                    <text x={dmx} y={dmy + 4} textAnchor="middle" fontSize={11} fontWeight="600" fill={C.door} fontFamily="system-ui">{door.label}</text>
                  </g>
                );
              })}
              {/* Window labels */}
              {space.windows.map((win) => {
                const wmx = (sx(win.points[0]) + sx(win.points[1])) / 2;
                const wmy = (sy(win.points[0]) + sy(win.points[1])) / 2;
                return (
                  <g key={`wl-${win.id}`}>
                    <rect x={wmx - 18} y={wmy - 10} width={36} height={20} rx={4} fill="white" fillOpacity={0.95} stroke={C.window} strokeWidth={0.8} />
                    <text x={wmx} y={wmy + 4} textAnchor="middle" fontSize={11} fontWeight="600" fill={C.window} fontFamily="system-ui">{win.label}</text>
                  </g>
                );
              })}
              {/* Opening labels */}
              {(space.openings || []).map((op) => {
                const omx = (sx(op.points[0]) + sx(op.points[1])) / 2;
                const omy = (sy(op.points[0]) + sy(op.points[1])) / 2;
                return (
                  <g key={`ol-${op.id}`}>
                    <rect x={omx - 18} y={omy - 10} width={36} height={20} rx={4} fill="white" fillOpacity={0.95} stroke={C.opening} strokeWidth={0.8} />
                    <text x={omx} y={omy + 4} textAnchor="middle" fontSize={11} fontWeight="600" fill="#6b7280" fontFamily="system-ui">{op.label}</text>
                  </g>
                );
              })}
              {/* Wall letter tags — on top of everything, clickable */}
              {space.walls.map((wall) => {
                const p1 = wall.points[0];
                const p2 = wall.points[1];
                const { len } = wallNormal(p1, p2);
                if (len < 0.3) return null;
                const mx = (sx(p1) + sx(p2)) / 2;
                const my = (sy(p1) + sy(p2)) / 2;
                const isSelected = expandedWallId === wall.id;
                return (
                  <g key={`wt-${wall.id}`}
                    onClick={(e) => { e.stopPropagation(); handleWallClick(wall.id); }}
                    style={{ cursor: "pointer" }}
                  >
                    <rect x={mx - 10} y={my - 9} width={20} height={18} rx={3}
                      fill={isSelected ? "#3b82f6" : "white"} fillOpacity={0.95}
                      stroke={isSelected ? "#2563eb" : C.wallStroke} strokeWidth={1} />
                    <text x={mx} y={my + 4} textAnchor="middle" fontSize={10} fontWeight="700"
                      fill={isSelected ? "white" : C.wallStroke} fontFamily="system-ui">
                      {wall.label}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border" style={{ backgroundColor: C.wallFill, borderColor: C.wallStroke }} /> Walls</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ backgroundColor: C.door }} /> Doors</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ backgroundColor: C.window }} /> Windows</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: C.roomFill, border: `1px solid ${C.roomStroke}` }} /> Rooms</span>
        {space.squareFootage && (
          <span className="ml-auto font-medium text-zinc-700 dark:text-zinc-300">
            {Math.round(space.squareFootage)} SF &middot; {feetToFtIn(space.perimeterInFeet ?? 0)} perimeter
          </span>
        )}
      </div>

      {/* ─── Wall Elevations ─── */}
      <div ref={elevationsRef} className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Wall Elevations
        </h3>
        <div className="space-y-2">
          {space.walls.map((wall) => {
            const isExpanded = expandedWallId === wall.id;
            const hasOpenings = wall.childSurfaces && wall.childSurfaces.length > 0;
            const widthFtIn = feetToFtIn(wall.rawSize[0] * M_TO_FT);
            const heightFtIn = feetToFtIn(wall.rawSize[1] * M_TO_FT);

            return (
              <div key={wall.id} id={`wall-elev-${wall.id}`} className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
                {/* Header */}
                <button
                  onClick={(e) => {
                    const newId = isExpanded ? null : wall.id;
                    setExpandedWallId(newId);
                    if (newId) {
                      const target = e.currentTarget.parentElement;
                      setTimeout(() => target?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
                    }
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isExpanded ? "bg-blue-500 text-white" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    }`}>
                      {wall.label}
                    </span>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Wall {wall.label}</span>
                    <span className="text-xs text-zinc-400">{widthFtIn} × {heightFtIn}</span>
                    {hasOpenings && (
                      <span className="text-xs text-zinc-400">· {wall.childSurfaces!.length} surface{wall.childSurfaces!.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {hasOpenings && (
                      <div className="flex gap-1">
                        {wall.childSurfaces!.map((cs) => (
                          <span
                            key={cs.id}
                            className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
                            style={{ backgroundColor: catBg(cs.category), color: catColor(cs.category) }}
                          >
                            {cs.category === "window" ? "W" : cs.category === "door" ? "D" : "O"}
                          </span>
                        ))}
                      </div>
                    )}
                    <svg className={`h-4 w-4 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded elevation */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-700">
                    <WallElevationSVG wall={wall} />
                    {/* Dimensions */}
                    <div className="mt-2 flex gap-4 text-xs text-zinc-500">
                      <span>Width: <span className="font-medium text-zinc-700 dark:text-zinc-300">{widthFtIn}</span></span>
                      <span>Height: <span className="font-medium text-zinc-700 dark:text-zinc-300">{heightFtIn}</span></span>
                    </div>
                    {/* Objects key */}
                    {hasOpenings && (
                      <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                        <div className="mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Objects on Wall {wall.label}</div>
                        <div className="space-y-1">
                          {wall.childSurfaces!.map((cs) => (
                            <div key={cs.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold" style={{ backgroundColor: catBg(cs.category), color: catColor(cs.category) }}>
                                  {cs.category === "window" ? "W" : cs.category === "door" ? "D" : "O"}
                                </span>
                                <span className="font-medium text-zinc-700 dark:text-zinc-300">{cs.label}</span>
                                <span className="text-zinc-400">({cs.category})</span>
                              </div>
                              <span className="text-zinc-500">{feetToFtIn(cs.rawSize[0] * M_TO_FT)} × {feetToFtIn(cs.rawSize[1] * M_TO_FT)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers for category colors
// ---------------------------------------------------------------------------

function catColor(cat: string): string {
  return cat === "window" ? "#3b82f6" : cat === "door" ? "#f97316" : "#6b7280";
}
function catBg(cat: string): string {
  return cat === "window" ? "#dbeafe" : cat === "door" ? "#fff7ed" : "#f3f4f6";
}

// ---------------------------------------------------------------------------
// Wall Elevation SVG — front-view drawing of a single wall
// ---------------------------------------------------------------------------

function WallElevationSVG({ wall }: { wall: RendrWall }) {
  const wallW = wall.rawSize[0];
  const wallH = wall.rawSize[1];
  const SVG_W = 700;
  const scale = SVG_W / wallW;
  const SVG_H = wallH * scale;
  const pad = 30;

  return (
    <svg viewBox={`${-pad} ${-pad} ${SVG_W + pad * 2} ${SVG_H + pad * 2}`} className="w-full" style={{ maxHeight: "280px" }}>
      {/* Wall background */}
      <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={1.5} rx={2} />

      {/* Openings */}
      {(wall.childSurfaces || []).map((cs) => {
        const csX = cs.rect[0][0] * scale;
        const csY = cs.rect[0][1] * scale;
        const csW = cs.rect[1][0] * scale;
        const csH = cs.rect[1][1] * scale;
        const color = catColor(cs.category);
        const bg = catBg(cs.category);
        return (
          <g key={cs.id}>
            <rect x={csX} y={csY} width={csW} height={csH} fill={bg} stroke={color} strokeWidth={2} rx={1} />
            <text x={csX + csW / 2} y={csY + csH / 2 + 4} textAnchor="middle" fontSize={12} fontWeight="600" fill={color} fontFamily="system-ui">{cs.label}</text>
            {/* Width below */}
            <text x={csX + csW / 2} y={csY + csH + 14} textAnchor="middle" fontSize={9} fill="#6b7280" fontFamily="system-ui">{feetToFtIn(cs.rawSize[0] * M_TO_FT)}</text>
            {/* Height right */}
            <text x={csX + csW + 8} y={csY + csH / 2 + 3} textAnchor="start" fontSize={9} fill="#6b7280" fontFamily="system-ui">{feetToFtIn(cs.rawSize[1] * M_TO_FT)}</text>
          </g>
        );
      })}

      {/* Overall dimensions */}
      <line x1={0} y1={SVG_H + 15} x2={SVG_W} y2={SVG_H + 15} stroke="#93c5fd" strokeWidth={1} />
      <circle cx={0} cy={SVG_H + 15} r={2} fill="#93c5fd" />
      <circle cx={SVG_W} cy={SVG_H + 15} r={2} fill="#93c5fd" />
      <text x={SVG_W / 2} y={SVG_H + 26} textAnchor="middle" fontSize={10} fontWeight="600" fill="#3b82f6" fontFamily="system-ui">{feetToFtIn(wallW * M_TO_FT)}</text>
    </svg>
  );
}
