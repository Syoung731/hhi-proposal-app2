"use client";

import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChildSurface {
  id: string;
  label: string;
  category: string;
  rawSize: [number, number]; // [width, height] in meters
  rect: [[number, number], [number, number]]; // [[x, y], [width, height]]
}

interface WallElevation {
  id: string;
  label: string;
  rawSize: [number, number]; // [width, height] in meters
  childSurfaces: ChildSurface[];
  elevations: unknown[];
}

interface GeometryData {
  space: {
    walls: WallElevation[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const M_TO_FT = 3.28084;

function feetToFtIn(ft: number): string {
  const totalInches = Math.round(ft * 12);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches === 0 ? `${feet}'` : `${feet}' ${inches}"`;
}

function metersToFtIn(m: number): string {
  return feetToFtIn(m * M_TO_FT);
}

function categoryColor(cat: string): string {
  switch (cat) {
    case "window": return "#3b82f6"; // blue
    case "door": return "#f97316";   // orange
    case "opening": return "#a3a3a3"; // gray
    default: return "#6b7280";
  }
}

function categoryBg(cat: string): string {
  switch (cat) {
    case "window": return "#dbeafe"; // blue-100
    case "door": return "#fff7ed";   // orange-50
    case "opening": return "#f5f5f5"; // gray-100
    default: return "#f3f4f6";
  }
}

function categoryIcon(cat: string): string {
  switch (cat) {
    case "window": return "W";
    case "door": return "D";
    case "opening": return "O";
    default: return "?";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RendrWallElevations({ spaceId }: { spaceId: number }) {
  const [geometry, setGeometry] = useState<GeometryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWall, setExpandedWall] = useState<string | null>(null);
  const [showMeasurements, setShowMeasurements] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/rendr/spaces/${spaceId}/geometry`)
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setGeometry(d); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [spaceId]);

  if (loading) return (
    <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" /> Loading wall elevations...
    </div>
  );

  if (error || !geometry?.space?.walls) return (
    <div className="py-12 text-center"><p className="text-sm text-zinc-500">{error || "No wall data."}</p></div>
  );

  const walls = geometry.space.walls;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Wall Elevations
        </h3>
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={showMeasurements}
            onChange={(e) => setShowMeasurements(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-500"
          />
          Measurements
        </label>
      </div>

      <div className="space-y-2">
        {walls.map((wall) => {
          const isExpanded = expandedWall === wall.id;
          const hasOpenings = wall.childSurfaces && wall.childSurfaces.length > 0;
          const widthFt = metersToFtIn(wall.rawSize[0]);
          const heightFt = metersToFtIn(wall.rawSize[1]);

          return (
            <div key={wall.id} className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
              {/* Wall header — always visible */}
              <button
                onClick={() => setExpandedWall(isExpanded ? null : wall.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {wall.label}
                  </span>
                  <div>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Wall {wall.label}</span>
                    <span className="ml-2 text-xs text-zinc-500">{widthFt} × {heightFt}</span>
                  </div>
                  {hasOpenings && (
                    <span className="text-xs text-zinc-400">
                      · {wall.childSurfaces.length} surface{wall.childSurfaces.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasOpenings && (
                    <div className="flex gap-1">
                      {wall.childSurfaces.map((cs) => (
                        <span
                          key={cs.id}
                          className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
                          style={{ backgroundColor: categoryBg(cs.category), color: categoryColor(cs.category) }}
                        >
                          {categoryIcon(cs.category)}
                        </span>
                      ))}
                    </div>
                  )}
                  <svg
                    className={`h-4 w-4 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded elevation view */}
              {isExpanded && (
                <div className="border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-700">
                  {/* SVG elevation drawing */}
                  <WallElevationSVG
                    wall={wall}
                    showMeasurements={showMeasurements}
                  />

                  {/* Wall dimensions */}
                  <div className="mt-3 flex gap-4 text-xs text-zinc-500">
                    <span>Width: <span className="font-medium text-zinc-700 dark:text-zinc-300">{widthFt}</span></span>
                    <span>Height: <span className="font-medium text-zinc-700 dark:text-zinc-300">{heightFt}</span></span>
                  </div>

                  {/* Objects on wall — key */}
                  {hasOpenings && (
                    <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                      <div className="mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Objects on Wall {wall.label}
                      </div>
                      <div className="space-y-1">
                        {wall.childSurfaces.map((cs) => (
                          <div key={cs.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span
                                className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
                                style={{ backgroundColor: categoryBg(cs.category), color: categoryColor(cs.category) }}
                              >
                                {categoryIcon(cs.category)}
                              </span>
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">{cs.label}</span>
                              <span className="text-zinc-400">({cs.category})</span>
                            </div>
                            <span className="text-zinc-500">
                              {metersToFtIn(cs.rawSize[0])} × {metersToFtIn(cs.rawSize[1])}
                            </span>
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
  );
}

// ---------------------------------------------------------------------------
// Wall Elevation SVG
// ---------------------------------------------------------------------------

function WallElevationSVG({
  wall,
  showMeasurements,
}: {
  wall: WallElevation;
  showMeasurements: boolean;
}) {
  const wallW = wall.rawSize[0]; // meters
  const wallH = wall.rawSize[1];

  // SVG scale: fit into ~700px wide, proportional height
  const SVG_W = 700;
  const scale = SVG_W / wallW;
  const SVG_H = wallH * scale;
  const pad = 30; // padding for dimension labels

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${SVG_W + pad * 2} ${SVG_H + pad * 2}`}
      className="w-full"
      style={{ maxHeight: "300px" }}
    >
      {/* Wall background */}
      <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={1.5} rx={2} />

      {/* Child surfaces (windows, doors, openings) */}
      {(wall.childSurfaces || []).map((cs) => {
        const csX = cs.rect[0][0] * scale;
        const csY = cs.rect[0][1] * scale;
        const csW = cs.rect[1][0] * scale;
        const csH = cs.rect[1][1] * scale;
        const color = categoryColor(cs.category);
        const bg = categoryBg(cs.category);

        return (
          <g key={cs.id}>
            {/* Opening rectangle */}
            <rect
              x={csX} y={csY} width={csW} height={csH}
              fill={bg} stroke={color} strokeWidth={2} rx={1}
            />

            {/* Label inside */}
            <text
              x={csX + csW / 2}
              y={csY + csH / 2 + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight="600"
              fill={color}
              fontFamily="system-ui"
            >
              {cs.label}
            </text>

            {/* Measurements */}
            {showMeasurements && (
              <>
                {/* Width below opening */}
                <text
                  x={csX + csW / 2}
                  y={csY + csH + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#6b7280"
                  fontFamily="system-ui"
                >
                  {metersToFtIn(cs.rawSize[0])}
                </text>
                {/* Height on right side */}
                <text
                  x={csX + csW + 8}
                  y={csY + csH / 2 + 3}
                  textAnchor="start"
                  fontSize={9}
                  fill="#6b7280"
                  fontFamily="system-ui"
                >
                  {metersToFtIn(cs.rawSize[1])}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Overall wall dimensions */}
      {showMeasurements && (
        <>
          {/* Width dimension below */}
          <line x1={0} y1={SVG_H + 15} x2={SVG_W} y2={SVG_H + 15} stroke="#93c5fd" strokeWidth={1} />
          <circle cx={0} cy={SVG_H + 15} r={2} fill="#93c5fd" />
          <circle cx={SVG_W} cy={SVG_H + 15} r={2} fill="#93c5fd" />
          <text
            x={SVG_W / 2} y={SVG_H + 26}
            textAnchor="middle" fontSize={10} fontWeight="600" fill="#3b82f6" fontFamily="system-ui"
          >
            {metersToFtIn(wallW)}
          </text>

          {/* Height dimension on right */}
          <line x1={SVG_W + 15} y1={0} x2={SVG_W + 15} y2={SVG_H} stroke="#93c5fd" strokeWidth={1} />
          <circle cx={SVG_W + 15} cy={0} r={2} fill="#93c5fd" />
          <circle cx={SVG_W + 15} cy={SVG_H} r={2} fill="#93c5fd" />
          <text
            x={SVG_W + 20} y={SVG_H / 2 + 3}
            textAnchor="start" fontSize={10} fontWeight="600" fill="#3b82f6" fontFamily="system-ui"
            transform={`rotate(90, ${SVG_W + 20}, ${SVG_H / 2})`}
          >
            {metersToFtIn(wallH)}
          </text>
        </>
      )}
    </svg>
  );
}
