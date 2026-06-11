"use client";

/**
 * Blueprint-theme page underlay: faint graph-paper grid + drafting corner
 * brackets. Render on blank (no background image) slides when
 * `theme.surface.grid` is true:
 *
 *   {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
 */
export function BlueprintUnderlay() {
  const c = "rgba(26,35,50,0.20)";
  const bracket = (pos: React.CSSProperties): React.CSSProperties => ({
    position: "absolute", width: "2.4%", height: "4.4%", ...pos,
  });
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(26,35,50,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(26,35,50,0.05) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
      <div style={bracket({ top: "3.5%", left: "2.6%", borderTop: `2px solid ${c}`, borderLeft: `2px solid ${c}` })} />
      <div style={bracket({ top: "3.5%", right: "2.6%", borderTop: `2px solid ${c}`, borderRight: `2px solid ${c}` })} />
      <div style={bracket({ bottom: "3.5%", left: "2.6%", borderBottom: `2px solid ${c}`, borderLeft: `2px solid ${c}` })} />
      <div style={bracket({ bottom: "3.5%", right: "2.6%", borderBottom: `2px solid ${c}`, borderRight: `2px solid ${c}` })} />
    </div>
  );
}
