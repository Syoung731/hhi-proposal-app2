/**
 * Standalone SVG markup for default Lucide-style icons.
 * Used to seed the BrandIcon library with starter icons.
 * Each value is a complete SVG string ready to be uploaded as a .svg file.
 */

const SVG_WRAP = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24" fill="none" stroke="#B8860B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const DEFAULT_ICON_SVGS: Record<string, { name: string; svg: string }> = {
  shield: {
    name: "Shield",
    svg: SVG_WRAP('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  },
  scale: {
    name: "Scale",
    svg: SVG_WRAP('<path d="M16 16l3-8 3 8c-1.5 1-4.5 1-6 0z"/><path d="M2 16l3-8 3 8c-1.5 1-4.5 1-6 0z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>'),
  },
  "message-square": {
    name: "Message Square",
    svg: SVG_WRAP('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>'),
  },
  lightbulb: {
    name: "Lightbulb",
    svg: SVG_WRAP('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'),
  },
  users: {
    name: "Users",
    svg: SVG_WRAP('<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'),
  },
  "file-check": {
    name: "File Check",
    svg: SVG_WRAP('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/>'),
  },
  "clipboard-list": {
    name: "Clipboard List",
    svg: SVG_WRAP('<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>'),
  },
  zap: {
    name: "Zap",
    svg: SVG_WRAP('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  },
  "check-circle": {
    name: "Check Circle",
    svg: SVG_WRAP('<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
  },
  "dollar-sign": {
    name: "Dollar Sign",
    svg: SVG_WRAP('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),
  },
  "pen-tool": {
    name: "Pen Tool",
    svg: SVG_WRAP('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>'),
  },
  ruler: {
    name: "Ruler",
    svg: SVG_WRAP('<path d="M21.7 4.3L19.7 2.3a1 1 0 00-1.4 0l-16 16a1 1 0 000 1.4l2 2a1 1 0 001.4 0l16-16a1 1 0 000-1.4z"/><path d="M14.5 7.5l1 1M11.5 10.5l1 1M8.5 13.5l1 1M5.5 16.5l1 1"/>'),
  },
  clock: {
    name: "Clock",
    svg: SVG_WRAP('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  },
};
