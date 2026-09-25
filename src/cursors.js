// Custom high-contrast cursor set for SketchER.
// Replaces crude solid-color block hand cursors with a dual-tone vector cursor set
// featuring crisp contrast borders, natural anatomical hand silhouettes, and ambient drop shadows.
// Designed to ensure 100% legibility on light canvas, dark canvas, white cards, and vibrant table headers.

function buildSvgCursor({
  svgContent,
  hotspot = "11 6",
  fallback = "default",
}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${svgContent}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot}, ${fallback}`;
}

const GRAB_PATH =
  "M10 26 C9 24.5 6.5 21 5 18.5 C3.8 16.5 4.8 14.5 6.8 15.2 C8 15.7 9.8 17.5 10.8 19 " +
  "L10.8 6.5 C10.8 5.1 11.9 4 13.3 4 C14.7 4 15.8 5.1 15.8 6.5 L15.8 13.5 " +
  "L15.8 4.5 C15.8 3.1 16.9 2 18.3 2 C19.7 2 20.8 3.1 20.8 4.5 L20.8 13.5 " +
  "L20.8 5.5 C20.8 4.1 21.9 3 23.3 3 C24.7 3 25.8 4.1 25.8 5.5 L25.8 13.5 " +
  "L25.8 8 C25.8 6.6 26.9 5.5 28.3 5.5 C29.7 5.5 30.8 6.6 30.8 8 " +
  "L30.8 18 C30.8 23.5 25.8 27.5 19.8 27.5 Z";

const GRABBING_PATH =
  "M10 26 C8.5 24 6.8 21.2 6.5 18 C6 15 8 13.5 9.5 14.5 C10.8 15.5 12 17 12 17 " +
  "C12 17 11.5 11.5 11.5 10 C11.5 8.6 12.6 7.5 14 7.5 C15.4 7.5 16.5 8.6 16.5 10 L16.5 14.5 " +
  "C16.5 14.5 16.5 9.5 16.5 8.5 C16.5 7.1 17.6 6 19 6 C20.4 6 21.5 7.1 21.5 8.5 L21.5 14.5 " +
  "C21.5 14.5 21.5 10 21.5 9 C21.5 7.6 22.6 6.5 24 6.5 C25.4 6.5 26.5 7.6 26.5 9 L26.5 14.5 " +
  "C26.5 14.5 26.5 11 26.5 10 C26.5 8.6 27.6 7.5 29 7.5 C30.4 7.5 31.5 8.6 31.5 10 " +
  "L31.5 17.5 C31.5 23 26 27.5 19 27.5 Z";

export function createGrabCursor(isDark = false) {
  const fillColor = "#ffffff";
  const strokeColor = isDark ? "#000000" : "#0f172a";
  const shadowColor = isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.28)";

  const content =
    `<path d="${GRAB_PATH}" transform="translate(0, 1.2)" fill="${shadowColor}" stroke="${shadowColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${GRAB_PATH}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="M15.8 11.5 L15.8 15.5 M20.8 11.5 L20.8 15.5 M25.8 12.5 L25.8 16.5 M10.8 15.5 L10.8 19" stroke="${strokeColor}" stroke-width="1.2" stroke-linecap="round"/>`;

  return buildSvgCursor({
    svgContent: content,
    hotspot: "11 6",
    fallback: "grab",
  });
}

export function createGrabbingCursor(isDark = false) {
  const fillColor = "#ffffff";
  const strokeColor = isDark ? "#000000" : "#0f172a";
  const shadowColor = isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.28)";

  const content =
    `<path d="${GRABBING_PATH}" transform="translate(0, 1.2)" fill="${shadowColor}" stroke="${shadowColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${GRABBING_PATH}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="M8 17.5 C9.5 16 13.5 15 16 17.5" stroke="${strokeColor}" stroke-width="1.4" stroke-linecap="round" fill="none"/>` +
    `<path d="M16.5 11.5 L16.5 14.5 M21.5 11.5 L21.5 14.5 M26.5 12 L26.5 14.5" stroke="${strokeColor}" stroke-width="1.1" stroke-linecap="round"/>`;

  return buildSvgCursor({
    svgContent: content,
    hotspot: "11 6",
    fallback: "grabbing",
  });
}

export function createColResizeCursor(isDark = false) {
  const fillColor = "#ffffff";
  const strokeColor = isDark ? "#000000" : "#0f172a";
  const shadowColor = isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.25)";

  const lines =
    "M16 4 L16 28 M8 16 L2 16 M2 16 L6 12 M2 16 L6 20 M24 16 L30 16 M30 16 L26 12 M30 16 L26 20";

  const content =
    `<path d="${lines}" transform="translate(0, 1)" stroke="${shadowColor}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
    `<path d="${lines}" stroke="${strokeColor}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
    `<path d="${lines}" stroke="${fillColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;

  return buildSvgCursor({
    svgContent: content,
    hotspot: "16 16",
    fallback: "col-resize",
  });
}

export function createMoveCursor(isDark = false) {
  const fillColor = "#ffffff";
  const strokeColor = isDark ? "#000000" : "#0f172a";
  const shadowColor = isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.25)";

  const lines =
    "M16 3 L16 29 M3 16 L29 16 M16 3 L12 7 M16 3 L20 7 M16 29 L12 25 M16 29 L20 25 M3 16 L7 12 M3 16 L7 20 M29 16 L25 12 M29 16 L25 20";

  const content =
    `<path d="${lines}" transform="translate(0, 1)" stroke="${shadowColor}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
    `<path d="${lines}" stroke="${strokeColor}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
    `<path d="${lines}" stroke="${fillColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
    `<circle cx="16" cy="16" r="2.5" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>`;

  return buildSvgCursor({
    svgContent: content,
    hotspot: "16 16",
    fallback: "move",
  });
}

export function getThemeCursorVariables(isDark = false) {
  return {
    "--sker-cursor-grab": createGrabCursor(isDark),
    "--sker-cursor-grabbing": createGrabbingCursor(isDark),
    "--sker-cursor-col-resize": createColResizeCursor(isDark),
    "--sker-cursor-move": createMoveCursor(isDark),
  };
}

// Backward-compatible adapter for handCursorCss(fill, open)
export function handCursorCss(fill, open) {
  const isDark = fill === "#ffffff" || (typeof fill === "string" && fill.toLowerCase() === "#fff");
  return open ? createGrabCursor(isDark) : createGrabbingCursor(isDark);
}
