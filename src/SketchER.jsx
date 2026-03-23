// Copyright (c) 2025 Puru Singh — https://github.com/Puru-Singh
// Licensed under the MIT License — see LICENSE for details.

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

const DEFAULT_DBML = `Table users {
  id int [pk]
  username varchar
  email varchar
  created_at datetime
  role_id int [ref: > roles.id]
}

Table roles {
  id int [pk]
  name varchar
  description text
}

Table posts {
  id int [pk]
  title varchar
  content text
  author_id int [ref: > users.id]
  category_id int [ref: > categories.id]
  created_at datetime
  updated_at datetime
}

Table categories {
  id int [pk]
  name varchar
  slug varchar
}

Table comments {
  id int [pk]
  post_id int [ref: > posts.id]
  user_id int [ref: > users.id]
  body text
  created_at datetime
}

TableGroup Auth {
  users
  roles
}

TableGroup Content {
  posts
  categories
  comments
}`;

const TABLE_COLORS = [
  "#ef4444", // 0°   red
  "#f97316", // 25°  orange
  "#eab308", // 54°  yellow
  "#84cc16", // 82°  lime
  "#22c55e", // 142° green
  "#14b8a6", // 173° teal
  "#06b6d4", // 192° cyan
  "#3b82f6", // 217° blue
  "#8b5cf6", // 258° violet
  "#c026d3", // 295° fuchsia
  "#ec4899", // 322° pink
  "#f43f5e", // 351° rose
];

const GROUP_ACCENT_COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];

// ── Color utilities for hue-family generation ────────────────────────────────
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Generate `count` visually related but distinct colors from a base hex color.
// Spreads ±10° hue, varies lightness ±12%, keeps saturation close to base.
function generateHueFamily(baseHex, count) {
  if (count <= 1) return [baseHex];
  const [h, s, l] = hexToHsl(baseHex);
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const hNew = (h + (t - 0.5) * 20 + 360) % 360;
    const lNew = Math.max(32, Math.min(68, l + (t - 0.5) * 24));
    const sNew = Math.max(55, Math.min(92, s + (t - 0.5) * 10));
    return hslToHex(hNew, sNew, lNew);
  });
}

const LIGHT_THEME = {
  appBg: "#ffffff",
  editorPanelBg: "#f3f3f3",
  editorHeaderBg: "linear-gradient(180deg, #ebebeb 0%, #f3f3f3 100%)",
  border: "#e4e4e4",
  textPrimary: "#1e1e1e",
  textSecondary: "#6e6e6e",
  textMuted: "#a0a0a0",
  editorText: "#1e1e1e",
  lineNumberColor: "#c0c0c0",
  lineNumberBorder: "#e4e4e4",
  tableBg: "#ffffff",
  tableBorder: "#d8d8d8",
  colDivider: "#eeeeee",
  colText: "#3b3b3b",
  colType: "#8a92a0",
  footerBg: "#ebebeb",
  toolbarBg: "#ffffff",
  toolbarBorder: "#d4d4d4",
  toolbarText: "#5a5a5a",
  canvasBg: "radial-gradient(ellipse at 50% 40%, #f5f5f5 0%, #ebebeb 100%)",
  dotColor: "#d4d4d4",
  minimapBg: "rgba(255,255,255,0.92)",
  colorPaletteRowBg: "#eaeaea",
  statText: "#6e6e6e",
  resizeHandleHover: "#10b98180",
  emptyStateColor: "#c8c8c8",
  lineColor: "#b0bac8",
  activeColBg: "rgba(59,130,246,0.07)",
  // Syntax highlighting
  synKeyword: "#d73a49",   // Table, Ref, TableGroup
  synTableName: "#6f42c1", // table/group names
  synType: "#005cc5",      // column types
  synBracket: "#e36209",   // [ ]
  synAttr: "#22863a",      // pk, ref:, etc.
  synComment: "#6a737d",   // -- comments
  synPunctuation: "#24292e",
  synString: "#032f62",
};

const DARK_THEME = {
  appBg: "#1e1e1e",
  editorPanelBg: "#252526",
  editorHeaderBg: "linear-gradient(180deg, #2a2a2b 0%, #252526 100%)",
  border: "#3e3e42",
  textPrimary: "#d4d4d4",
  textSecondary: "#9d9d9d",
  textMuted: "#6e6e6e",
  editorText: "#d4d4d4",
  lineNumberColor: "#555555",
  lineNumberBorder: "#3e3e42",
  tableBg: "#252526",
  tableBorder: "#3e3e42",
  colDivider: "#3e3e42",
  colText: "#d1d5db",
  colType: "#6b7280",
  footerBg: "#1e1e1e",
  toolbarBg: "#2d2d2d",
  toolbarBorder: "#3e3e42",
  toolbarText: "#9d9d9d",
  canvasBg: "radial-gradient(ellipse at 50% 40%, #252526 0%, #1e1e1e 100%)",
  dotColor: "#2d2d2d",
  minimapBg: "rgba(30,30,30,0.92)",
  colorPaletteRowBg: "#2a2a2b",
  statText: "#6b7280",
  resizeHandleHover: "#10b98180",
  emptyStateColor: "#444466",
  lineColor: "#5c6472",
  activeColBg: "rgba(59,130,246,0.14)",
  // Syntax highlighting
  synKeyword: "#f97583",
  synTableName: "#b392f0",
  synType: "#79b8ff",
  synBracket: "#ffab70",
  synAttr: "#85e89d",
  synComment: "#6a737d",
  synPunctuation: "#e1e4e8",
  synString: "#9ecbff",
};

function parseDBML(text) {
  const tables = [];
  const refs = [];
  const tableRegex = /Table\s+(\w+)\s*\{([^}]*)\}/gi;
  let match;
  while ((match = tableRegex.exec(text)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const columns = [];
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const colMatch = line.match(/^(\w+)\s+(\w+)(.*)$/);
      if (colMatch) {
        const colName = colMatch[1];
        const colType = colMatch[2];
        const rest = colMatch[3] || "";
        const isPk = /\[.*pk.*\]/i.test(rest);
        const refMatch = rest.match(/ref:\s*([<>-])\s*(\w+)\.(\w+)/i);
        if (refMatch) {
          refs.push({
            from: { table: tableName, column: colName },
            to: { table: refMatch[2], column: refMatch[3] },
            type: refMatch[1],
          });
        }
        columns.push({ name: colName, type: colType, isPk });
      }
    }
    tables.push({ name: tableName, columns });
  }
  const refLineRegex = /Ref:\s*(\w+)\.(\w+)\s*([<>-])\s*(\w+)\.(\w+)/gi;
  let refMatch;
  while ((refMatch = refLineRegex.exec(text)) !== null) {
    refs.push({
      from: { table: refMatch[1], column: refMatch[2] },
      to: { table: refMatch[4], column: refMatch[5] },
      type: refMatch[3],
    });
  }
  const groups = [];
  const groupRegex = /TableGroup\s+(\w+)\s*\{([^}]*)\}/gi;
  let gMatch;
  while ((gMatch = groupRegex.exec(text)) !== null) {
    const groupName = gMatch[1];
    const members = gMatch[2].split("\n").map((l) => l.trim()).filter(Boolean);
    groups.push({ name: groupName, tables: members });
  }
  return { tables, refs, groups };
}

// ── DBML syntax highlighting ─────────────────────────────────────────────────
function highlightDBML(text, theme, glowLines) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text.split("\n").map((line) => {
    // Comments
    if (/^\s*--/.test(line)) {
      return `<span style="color:${theme.synComment}">${esc(line)}</span>`;
    }
    // Table / TableGroup declaration line
    const declMatch = line.match(/^(\s*)(Table|TableGroup|Ref)(\s+)(\w+)(\s*\{?\s*)$/i);
    if (declMatch) {
      const [, indent, kw, sp1, name, rest] = declMatch;
      return `${esc(indent)}<span style="color:${theme.synKeyword}">${esc(kw)}</span>${esc(sp1)}<span style="color:${theme.synTableName}">${esc(name)}</span>${esc(rest)}`;
    }
    // Standalone Ref line: Ref: a.b > c.d
    const refLine = line.match(/^(\s*)(Ref)(\s*:\s*)(\w+\.\w+)(\s*[<>-]\s*)(\w+\.\w+)(.*)/i);
    if (refLine) {
      const [, indent, kw, colon, left, op, right, rest] = refLine;
      return `${esc(indent)}<span style="color:${theme.synKeyword}">${esc(kw)}</span>${esc(colon)}<span style="color:${theme.synTableName}">${esc(left)}</span><span style="color:${theme.synPunctuation}">${esc(op)}</span><span style="color:${theme.synTableName}">${esc(right)}</span>${esc(rest)}`;
    }
    // Column lines (inside table body)
    const colMatch = line.match(/^(\s+)(\w+)(\s+)(\w+)(.*)/);
    if (colMatch) {
      const [, indent, colName, sp, colType, rest] = colMatch;
      // Highlight bracket contents
      let highlighted = esc(rest);
      highlighted = highlighted.replace(/\[([^\]]*)\]/g, (_, inner) => {
        let hi = inner;
        hi = hi.replace(/(pk|unique|not null|null|increment|note)/gi, `<span style="color:${theme.synAttr}">$1</span>`);
        hi = hi.replace(/(ref\s*:\s*(?:&lt;|&gt;|-)\s*\w+\.\w+)/gi, `<span style="color:${theme.synAttr}">$1</span>`);
        return `<span style="color:${theme.synBracket}">[</span>${hi}<span style="color:${theme.synBracket}">]</span>`;
      });
      return `${esc(indent)}<span style="color:${theme.synPunctuation}">${esc(colName)}</span>${esc(sp)}<span style="color:${theme.synType}">${esc(colType)}</span>${highlighted}`;
    }
    // Closing brace or other
    return esc(line);
  }).map((html, idx) => {
    const isGlowing = glowLines && idx >= glowLines.start && idx <= glowLines.end;
    return isGlowing
      ? `<span style="background:rgba(16,185,129,0.15);display:inline-block;width:100%;transition:background 0.4s">${html}</span>`
      : html;
  }).join("\n");
}

const COL_HEIGHT = 32;
const HEADER_HEIGHT = 42;
const TABLE_WIDTH = 230;
const TABLE_CORNER_RADIUS = 6;

// 0 = fully transparent, 1 = fully black. Tweak to taste.
const TABLE_NAME_DARKNESS = 0.5;

// Resting opacity of the color wheel icon in table headers (0–1).
const COLOR_WHEEL_RESTING_OPACITY = 0.5;

function getColumnY(table, colIndex) {
  return table.y + HEADER_HEIGHT + colIndex * COL_HEIGHT + COL_HEIGHT / 2;
}

// Crow's foot (many/FK) end — vertical bar + two prongs
function CrowFoot({ x, y, dir, color }) {
  const spread = 6, depth = 10;
  const px = dir === "right" ? x + depth : x - depth;
  return (
    <>
      <line x1={x} y1={y - spread} x2={x} y2={y + spread} stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1={x} y1={y} x2={px} y2={y - spread} stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1={x} y1={y} x2={px} y2={y + spread} stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </>
  );
}

// How far apart to spread parallel connections that exit the same table side
const LANE_SPACING = 24;
// How far apart to spread multiple connections arriving at the same PK column
const ARRIVE_SPREAD = 8;

function RelationshipLines({ refs, tablePositions, tableData, theme, hoveredTable, selectedTables, showAllConnections, tableColors, tableWidths, lineMidXOverrides, onLineDragStart }) {
  // ── Phase 1: resolve direction + column indices for every valid ref ──────
  const items = useMemo(() => {
    const result = [];
    for (const ref of refs) {
      const fromPos = tablePositions[ref.from.table];
      const toPos   = tablePositions[ref.to.table];
      const fromData = tableData.find((t) => t.name === ref.from.table);
      const toData   = tableData.find((t) => t.name === ref.to.table);
      if (!fromPos || !toPos || !fromData || !toData) continue;

      const fromColIdx = fromData.columns.findIndex((c) => c.name === ref.from.column);
      const toColIdx   = toData.columns.findIndex((c) => c.name === ref.to.column);
      if (fromColIdx === -1 || toColIdx === -1) continue;

      const fromW     = tableWidths[ref.from.table] || TABLE_WIDTH;
      const toW       = tableWidths[ref.to.table]   || TABLE_WIDTH;
      const fromRight = fromPos.x + fromW;
      const toRight   = toPos.x  + toW;

      // Detect vertical stacking: tables heavily overlap in X → C-shape routing
      const xOverlap = Math.max(0, Math.min(fromRight, toRight) - Math.max(fromPos.x, toPos.x));
      const isVerticalStack = xOverlap / Math.min(fromW, toW) > 0.5;

      let crowDir;
      if (isVerticalStack) {
        crowDir = "vert-left";                   // both tables use left edge, C-shape going left
      } else if (fromPos.x >= toRight) {
        crowDir = "left";                        // from is clearly right of to
      } else if (toPos.x >= fromRight) {
        crowDir = "right";                       // to is clearly right of from
      } else {
        crowDir = (fromPos.x + fromW / 2) <= (toPos.x + toW / 2) ? "right" : "left";
      }

      result.push({ ref, fromColIdx, toColIdx, crowDir });
    }
    return result;
  }, [refs, tablePositions, tableData, tableWidths]);

  // ── Phase 2: assign FROM-side lanes ──────────────────────────────────────
  // Connections leaving the same table on the same side get staggered midpoints
  // so their vertical corridor segments never overlap.
  // Sort by column index (top → bottom) so the visual fan is predictable.
  const itemsWithLanes = useMemo(() => {
    const fromGroups = {};
    items.forEach((item) => {
      const key = `${item.ref.from.table}::${item.crowDir}`;
      (fromGroups[key] ??= []).push(item);
    });
    Object.values(fromGroups).forEach((group) => {
      group.sort((a, b) => a.fromColIdx - b.fromColIdx);
      group.forEach((item, i) => {
        item.fromLane      = i;
        item.fromLaneCount = group.length;
      });
    });

    // ── Phase 3: assign TO-side lanes ────────────────────────────────────
    // Multiple connections arriving at the exact same PK column get a small
    // vertical spread so the circles don't stack on top of each other.
    const toGroups = {};
    items.forEach((item) => {
      const key = `${item.ref.to.table}::${item.ref.to.column}`;
      (toGroups[key] ??= []).push(item);
    });
    Object.values(toGroups).forEach((group) => {
      // Sort by fromTable name for a consistent, deterministic order
      group.sort((a, b) => a.ref.from.table.localeCompare(b.ref.from.table));
      group.forEach((item, i) => {
        item.toLane      = i;
        item.toLaneCount = group.length;
      });
    });

    return items;
  }, [items]);

  // ── Render ────────────────────────────────────────────────────────────────
  const lines = [];

  for (const item of itemsWithLanes) {
    const { ref, fromColIdx, toColIdx, crowDir,
            fromLane, fromLaneCount, toLane, toLaneCount } = item;

    const fromPos = tablePositions[ref.from.table];
    const toPos   = tablePositions[ref.to.table];
    const fromRight = fromPos.x + (tableWidths[ref.from.table] || TABLE_WIDTH);
    const toRight   = toPos.x  + (tableWidths[ref.to.table]   || TABLE_WIDTH);

    const fromY = getColumnY(fromPos, fromColIdx);
    const toY   = getColumnY(toPos,   toColIdx);

    // Exact entry/exit points on the table edges
    // vert-left: FROM uses left edge, TO also uses left edge (C-shape around outside)
    const x1 = crowDir === "right" ? fromRight + 1 : fromPos.x - 1;
    const x2 = (crowDir === "right" || crowDir === "vert-left") ? toPos.x - 1 : toRight + 1;

    // Crow's foot depth = 10px; circle sits 10px from the table edge
    const pathX1  = crowDir === "right" ? x1 + 10 : x1 - 10;
    const pathX2  = (crowDir === "right" || crowDir === "vert-left") ? x2 - 6  : x2 + 6;
    const circleX = (crowDir === "right" || crowDir === "vert-left") ? x2 - 10 : x2 + 10;

    // ── FROM-side lane: offset midpoint so parallel corridors don't overlap ──
    const laneOffset = fromLaneCount > 1
      ? (fromLane - (fromLaneCount - 1) / 2) * LANE_SPACING
      : 0;
    let midX;
    if (crowDir === "vert-left") {
      // C-shape: midX is to the LEFT of both tables' left edges, lanes spread further left
      const outerLeft = Math.min(fromPos.x, toPos.x) - 30;
      midX = outerLeft - Math.abs(laneOffset);
    } else {
      const baseMidX = (pathX1 + pathX2) / 2;
      // For "right", higher lane index → larger midX (fan out rightward).
      // For "left",  higher lane index → smaller midX (fan out leftward) — hence the sign flip.
      midX = baseMidX + (crowDir === "right" ? laneOffset : -laneOffset);
    }

    // ── TO-side lane: spread circles that land on the same PK column ─────────
    const arriveOffset = toLaneCount > 1
      ? (toLane - (toLaneCount - 1) / 2) * ARRIVE_SPREAD
      : 0;
    const toYAdj = toY + arriveOffset;

    // ── Styling ──────────────────────────────────────────────────────────────
    const isActive = showAllConnections
      || hoveredTable === ref.from.table || hoveredTable === ref.to.table
      || selectedTables.has(ref.from.table) || selectedTables.has(ref.to.table);
    const lineColor = isActive
      ? (tableColors[ref.from.table] || theme.lineColor)
      : theme.lineColor;
    const hasFilter = !showAllConnections && (hoveredTable || selectedTables.size > 0);
    const opacity = hasFilter && !isActive ? 0.18 : 1;

    // Label positions (just outside the decoration, above the line)
    // vert-left FROM uses left edge (same as "left"), TO uses left edge (same as "right")
    const starX      = crowDir === "right" ? x1 + 13 : x1 - 13;
    const starAnchor = crowDir === "right" ? "start"  : "end";
    const cardX      = (crowDir === "right" || crowDir === "vert-left") ? x2 - 13 : x2 + 13;
    const cardAnchor = (crowDir === "right" || crowDir === "vert-left") ? "end"   : "start";

    const pathKey = `rline-${ref.from.table}-${ref.from.column}-${ref.to.table}-${ref.to.column}`;
    // Apply user's manual midX drag override if present
    const finalMidX = lineMidXOverrides[pathKey] ?? midX;
    const path = `M ${pathX1} ${fromY} H ${finalMidX} V ${toYAdj} H ${pathX2}`;

    // Vertical segment geometry (for hit area + grip dot)
    const segMinY = Math.min(fromY, toYAdj);
    const segMaxY = Math.max(fromY, toYAdj);
    const segMidY = (fromY + toYAdj) / 2;
    const hasVertSeg = segMaxY - segMinY > 4;

    lines.push(
      <g key={pathKey} opacity={opacity}>
        <path id={pathKey} d={path} fill="none" stroke={lineColor} strokeWidth="1.3" />

        {/* Draggable hit area on the vertical corridor segment */}
        {hasVertSeg && (
          <line
            x1={finalMidX} y1={segMinY} x2={finalMidX} y2={segMaxY}
            stroke="transparent" strokeWidth="16"
            style={{ cursor: "col-resize", pointerEvents: "stroke" }}
            onMouseDown={(e) => { e.stopPropagation(); onLineDragStart(pathKey, e.clientX, finalMidX); }}
          />
        )}
        {/* Grip dot — subtle affordance on the vertical segment midpoint */}
        {hasVertSeg && (
          <circle cx={finalMidX} cy={segMidY} r="2.5"
            fill={lineColor} opacity={isActive ? 0.6 : 0.25}
            style={{ pointerEvents: "none" }} />
        )}

        <CrowFoot x={x1} y={fromY} dir={crowDir === "right" ? "right" : "left"} color={lineColor} />
        <circle cx={circleX} cy={toYAdj} r="3.5" fill="none" stroke={lineColor} strokeWidth="1.3" />

        {/* Cardinality labels */}
        <text x={starX} y={fromY - 7} fill={lineColor} fontSize="11"
          fontFamily="'DM Sans', sans-serif" textAnchor={starAnchor} fontWeight="700">*</text>
        <text x={cardX} y={toYAdj - 7} fill={lineColor} fontSize="9.5"
          fontFamily="'DM Sans', sans-serif" textAnchor={cardAnchor} opacity="0.85">0..1</text>

        {/* Animated dot — moves PK → FK (reversed); always shown when showAllConnections */}
        {isActive && (
          <circle r="2.8" fill={lineColor} opacity="0.9">
            <animateMotion dur="1.8s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear">
              <mpath href={`#${pathKey}`} />
            </animateMotion>
          </circle>
        )}
      </g>
    );
  }
  return <>{lines}</>;
}

// Pre-computed donut color wheel paths (6 × 60° segments, outer r=8.5, inner r=4, center 10 10)
const COLOR_WHEEL_SEGS = (() => {
  const R = 8.5, r = 4, cx = 10, cy = 10;
  const colors = ["#f87171", "#fbbf24", "#34d399", "#22d3ee", "#818cf8", "#f472b6"];
  return colors.map((color, i) => {
    const a0 = -Math.PI / 2 + i * (Math.PI / 3);
    const a1 = a0 + Math.PI / 3;
    const f = (n) => n.toFixed(3);
    const [ox0, oy0] = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)];
    const [ox1, oy1] = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
    const [ix0, iy0] = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const [ix1, iy1] = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const d = `M${f(ox0)} ${f(oy0)} A${R} ${R} 0 0 1 ${f(ox1)} ${f(oy1)} L${f(ix1)} ${f(iy1)} A${r} ${r} 0 0 0 ${f(ix0)} ${f(iy0)}Z`;
    return { color, d };
  });
})();

function ColorWheelIcon({ lit }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20"
      style={{ display: "block", opacity: lit ? 1 : COLOR_WHEEL_RESTING_OPACITY, transition: "opacity 0.15s", pointerEvents: "none" }}>
      {COLOR_WHEEL_SEGS.map((s) => <path key={s.color} d={s.d} fill={s.color} />)}
    </svg>
  );
}

function TableNode({ table, position, color, onDragStart, onColorChange, isSelected, onSelect, theme, fkColumns, activeColumns, onHover, width, isDimmed }) {
  const [pickerHovered, setPickerHovered] = useState(false);
  const [pickerFocused, setPickerFocused] = useState(false);
  const pickerLit = pickerHovered || pickerFocused;

  const handleMouseDown = (e) => {
    if (e.target.closest(".color-picker-area")) return;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+click: toggle membership in multi-selection, no drag
      onSelect(table.name, true);
    } else {
      onSelect(table.name, false);
      onDragStart(table.name, e.clientX, e.clientY);
    }
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => onHover(table.name)}
      onMouseLeave={() => onHover(null)}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: width || TABLE_WIDTH,
        borderRadius: "6px",
        overflow: "hidden",
        boxShadow: isSelected
          ? `0 0 0 2px ${color}, 0 8px 24px rgba(0,0,0,0.12)`
          : `0 2px 8px rgba(0,0,0,0.09), 0 0 0 1px ${theme.tableBorder}`,
        cursor: "grab",
        userSelect: "none",
        opacity: isDimmed ? 0.35 : 1,
        transition: "box-shadow 0.15s ease, opacity 0.2s ease",
        background: theme.tableBg,
        border: `1px solid ${isSelected ? color : theme.tableBorder}`,
      }}
    >
      {/* Flat solid header */}
      <div
        style={{
          height: HEADER_HEIGHT,
          background: color,
          display: "flex",
          alignItems: "center",
          position: "relative",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* Left-flush pill: square left edge, rounded right, capped before color wheel zone */}
        <span style={{
          display: "inline-block",
          background: `rgba(0,0,0,${TABLE_NAME_DARKNESS})`,
          borderRadius: `0 ${TABLE_CORNER_RADIUS}px ${TABLE_CORNER_RADIUS}px 0`,
          color: "#fff",
          padding: "4px 12px",
          fontSize: "12px",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}>{table.name}</span>
        {/* Color wheel: always 12px from right edge */}
        <div
          className="color-picker-area"
          style={{ position: "absolute", right: 12, width: 18, height: 18 }}
          onMouseEnter={() => setPickerHovered(true)}
          onMouseLeave={() => setPickerHovered(false)}
        >
          <ColorWheelIcon lit={pickerLit} />
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(table.name, e.target.value)}
            onFocus={() => setPickerFocused(true)}
            onBlur={() => setPickerFocused(false)}
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              width: "100%",
              height: "100%",
              cursor: "pointer",
              padding: 0,
              border: "none",
            }}
          />
          {pickerLit && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              background: theme.toolbarBg,
              border: `1px solid ${theme.toolbarBorder}`,
              color: theme.textPrimary,
              fontSize: "12.5px",
              fontWeight: 500,
              padding: "7px 14px",
              borderRadius: "8px",
              whiteSpace: "nowrap",
              boxShadow: "0 6px 20px rgba(0,0,0,0.13)",
              zIndex: 100,
              fontFamily: "'DM Sans', sans-serif",
              pointerEvents: "none",
              letterSpacing: "0.1px",
            }}>
              Pick table color
            </div>
          )}
        </div>
      </div>

      <div>
        {table.columns.map((col, i) => {
          const isFk = fkColumns?.has(col.name);
          const isHighlighted = activeColumns?.has(col.name);
          return (
            <div
              key={col.name}
              style={{
                height: COL_HEIGHT,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 12px",
                fontSize: "12.5px",
                borderBottom: i < table.columns.length - 1 ? `1px solid ${theme.colDivider}` : "none",
                background: isHighlighted ? theme.activeColBg : "transparent",
                transition: "background 0.15s",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: theme.colText }}>
                {col.isPk && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                  </svg>
                )}
                {isFk && !col.isPk && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
                <span style={{ fontWeight: col.isPk ? 600 : 400, fontStyle: isFk && !col.isPk ? "italic" : "normal" }}>
                  {col.name}
                </span>
              </span>
              <span
                style={{
                  color: theme.colType,
                  fontSize: "11px",
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontWeight: 400,
                }}
              >
                {col.type}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tooltip({ text, theme, align = "center" }) {
  const pos = align === "right"
    ? { right: 0 }
    : align === "left"
    ? { left: 0 }
    : { left: "50%", transform: "translateX(-50%)" };
  return (
    <div style={{
      position: "absolute",
      top: "calc(100% + 10px)",
      ...pos,
      background: theme.toolbarBg,
      border: `1px solid ${theme.toolbarBorder}`,
      color: theme.textPrimary,
      fontSize: "12.5px",
      fontWeight: 500,
      padding: "7px 14px",
      borderRadius: "8px",
      whiteSpace: "nowrap",
      boxShadow: "0 6px 20px rgba(0,0,0,0.13)",
      zIndex: 100,
      fontFamily: "'DM Sans', sans-serif",
      pointerEvents: "none",
      letterSpacing: "0.1px",
    }}>
      {text}
    </div>
  );
}

function TBtn({ onClick, tip, theme, children, style = {}, tipAlign = "center" }) {
  const [hovered, setHovered] = useState(false);
  const base = {
    position: "relative",
    padding: "7px 12px",
    background: theme.toolbarBg,
    border: `1px solid ${theme.toolbarBorder}`,
    borderRadius: "8px",
    color: theme.toolbarText,
    cursor: "pointer",
    fontSize: "12px",
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 500,
    transition: "all 0.15s",
    ...style,
  };
  return (
    <button style={base} onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      {children}
      {hovered && tip && <Tooltip text={tip} theme={theme} align={tipAlign} />}
    </button>
  );
}

function ZoomControl({ zoom, onZoomSet, theme }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(String(Math.round(zoom * 100)));
  const ref = useRef(null);

  useEffect(() => {
    setInputVal(String(Math.round(zoom * 100)));
  }, [zoom]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const applyInput = () => {
    const v = parseInt(inputVal, 10);
    if (!isNaN(v)) onZoomSet(Math.max(25, Math.min(200, v)) / 100);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "7px 12px",
          background: open ? "#10b98122" : theme.toolbarBg,
          border: `1px solid ${open ? "#10b981" : theme.toolbarBorder}`,
          borderRadius: "8px",
          color: open ? "#10b981" : theme.toolbarText,
          cursor: "pointer",
          fontSize: "11px",
          minWidth: "50px",
          textAlign: "center",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
          transition: "all 0.15s",
        }}
      >
        {Math.round(zoom * 100)}%
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: theme.toolbarBg,
          border: `1px solid ${theme.toolbarBorder}`,
          borderRadius: "10px",
          padding: "14px 16px",
          width: "210px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: theme.textMuted }}>
            <span>25%</span><span>200%</span>
          </div>
          <input
            type="range" min="25" max="200" step="5"
            value={Math.round(zoom * 100)}
            onChange={(e) => onZoomSet(parseInt(e.target.value, 10) / 100)}
            style={{ width: "100%", accentColor: "#10b981", cursor: "pointer" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="number" min="25" max="200"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { applyInput(); setOpen(false); } }}
              onBlur={applyInput}
              style={{
                flex: 1,
                padding: "5px 8px",
                background: theme.editorPanelBg,
                border: `1px solid ${theme.border}`,
                borderRadius: "6px",
                color: theme.textPrimary,
                fontSize: "12px",
                fontFamily: "'DM Sans', sans-serif",
                outline: "none",
                textAlign: "right",
              }}
            />
            <span style={{ fontSize: "12px", color: theme.textMuted, flexShrink: 0 }}>%</span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {[50, 100, 150].map((p) => (
              <button key={p} onClick={() => { onZoomSet(p / 100); setOpen(false); }}
                style={{
                  flex: 1, padding: "4px 0",
                  background: Math.round(zoom * 100) === p ? "#10b98122" : theme.editorPanelBg,
                  border: `1px solid ${Math.round(zoom * 100) === p ? "#10b981" : theme.border}`,
                  borderRadius: "6px", cursor: "pointer",
                  color: Math.round(zoom * 100) === p ? "#10b981" : theme.textSecondary,
                  fontSize: "11px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                }}>
                {p}%
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({ onAutoLayout, onZoomIn, onZoomOut, onZoomSet, zoom, onResetView, onFit, isDark, onToggleTheme, theme, onExport, onSave, onLoad, onShowHelp }) {
  return (
    <div data-export-hide="1" onMouseDown={(e) => e.stopPropagation()} style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: "6px", zIndex: 20 }}>
      <TBtn onClick={onToggleTheme} tip={isDark ? "Switch to light mode" : "Switch to dark mode"} theme={theme}>
        {isDark ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </TBtn>
      <TBtn onClick={onZoomOut} tip="Zoom out" theme={theme}>−</TBtn>
      <ZoomControl zoom={zoom} onZoomSet={onZoomSet} theme={theme} />
      <TBtn onClick={onZoomIn} tip="Zoom in" theme={theme}>+</TBtn>
      <TBtn onClick={onResetView} tip="Reset view" theme={theme}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 12a9 9 0 1 1 3 6.7" /><path d="M3 21v-6h6" />
        </svg>
      </TBtn>
      <TBtn onClick={onFit} tip="Fit all tables in view" theme={theme}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
          <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
        </svg>
        Fit
      </TBtn>
      <TBtn onClick={onAutoLayout} tip="Auto-arrange tables" theme={theme}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        Layout
      </TBtn>
      <TBtn onClick={onSave} tip="Save diagram to .sker file" theme={theme}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save
      </TBtn>
      <TBtn onClick={onLoad} tip="Open a .sker diagram file" theme={theme}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        Open
      </TBtn>
      <TBtn onClick={onExport} tip="Export diagram as PNG image" theme={theme}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export
      </TBtn>
      <TBtn onClick={onShowHelp} tip="Help & reference" theme={theme} tipAlign="right">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </TBtn>
    </div>
  );
}

const INFO_SECTIONS = [
  { id: "tables",        label: "Tables",          color: "#10b981" },
  { id: "relationships", label: "Relationships",   color: "#3b82f6" },
  { id: "groups",        label: "Table Groups",    color: "#8b5cf6" },
  { id: "canvas",        label: "Canvas Controls", color: "#f59e0b" },
  { id: "colors",        label: "Colors & Theming",color: "#ec4899" },
  { id: "saving",        label: "Saving & Export", color: "#06b6d4" },
];

function InfoModal({ theme, onClose }) {
  const [activeSection, setActiveSection] = useState("tables");
  const scrollRef = useRef(null);
  const sectionRefs = useRef({});

  const scrollTo = (id) => {
    const container = scrollRef.current;
    const target = sectionRefs.current[id];
    if (!container || !target) return;
    container.scrollTo({ top: target.offsetTop - 16, behavior: "smooth" });
    setActiveSection(id);
  };

  const Code = ({ children }) => (
    <pre style={{
      background: theme.editorPanelBg,
      border: `1px solid ${theme.border}`,
      borderRadius: "7px",
      padding: "11px 14px",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: "11.5px",
      color: theme.editorText,
      lineHeight: "1.75",
      margin: "8px 0 18px",
      overflowX: "auto",
      whiteSpace: "pre",
    }}>{children}</pre>
  );

  const Section = ({ id, color, icon, title, children }) => (
    <div ref={(el) => { if (id) sectionRefs.current[id] = el; }} style={{ marginBottom: "32px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        marginBottom: "12px", paddingBottom: "8px",
        borderBottom: `1px solid ${theme.border}`,
      }}>
        <span style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 26, height: 26, borderRadius: "7px",
          background: color + "22", color, flexShrink: 0,
        }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: "13.5px", color: theme.textPrimary, letterSpacing: "0.1px" }}>
          {title}
        </span>
      </div>
      <div style={{ fontSize: "12.5px", color: theme.textSecondary, lineHeight: "1.7" }}>
        {children}
      </div>
    </div>
  );

  const KBD = ({ children }) => (
    <code style={{
      display: "inline-block",
      background: theme.editorPanelBg,
      border: `1px solid ${theme.border}`,
      borderRadius: "4px",
      padding: "1px 6px",
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "11px",
      color: theme.textPrimary,
      lineHeight: "1.6",
    }}>{children}</code>
  );

  const Row = ({ label, children }) => (
    <div style={{ display: "flex", gap: "10px", marginBottom: "7px", alignItems: "flex-start" }}>
      <span style={{ color: theme.textMuted, flexShrink: 0, minWidth: 155, fontSize: "12px" }}>{label}</span>
      <span>{children}</span>
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.52)",
        zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.toolbarBg,
          border: `1px solid ${theme.toolbarBorder}`,
          borderRadius: "14px",
          width: "min(860px, 94vw)",
          maxHeight: "84vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
          overflow: "hidden",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 22px 14px",
          borderBottom: `1px solid ${theme.border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ fontWeight: 700, fontSize: "14px", color: theme.textPrimary }}>
              SketchER Reference
            </span>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: theme.textMuted, fontSize: "20px", lineHeight: 1,
            padding: "2px 6px", borderRadius: "6px",
          }}>×</button>
        </div>

        {/* Body = sidebar + content */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* Left sidebar */}
          <div style={{
            width: "162px",
            flexShrink: 0,
            borderRight: `1px solid ${theme.border}`,
            padding: "16px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            overflowY: "auto",
            background: theme.editorPanelBg,
          }}>
            {INFO_SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "7px 10px",
                  borderRadius: "7px",
                  border: "none",
                  background: activeSection === s.id ? s.color + "18" : "transparent",
                  color: activeSection === s.id ? s.color : theme.textSecondary,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "12px",
                  fontWeight: activeSection === s.id ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.13s",
                  width: "100%",
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: s.color,
                  flexShrink: 0,
                  opacity: activeSection === s.id ? 1 : 0.35,
                  transition: "opacity 0.13s",
                }} />
                {s.label}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div
            ref={scrollRef}
            onScroll={() => {
              const container = scrollRef.current;
              if (!container) return;
              const scrollTop = container.scrollTop;
              let current = INFO_SECTIONS[0].id;
              for (const s of INFO_SECTIONS) {
                const el = sectionRefs.current[s.id];
                if (el && el.offsetTop - 32 <= scrollTop) current = s.id;
              }
              setActiveSection(current);
            }}
            style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}
          >
            <Section id="tables" color="#10b981" title="Creating Tables"
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>}>
              <p style={{ marginTop: 0 }}>Each table block defines a database table. Column types are free-form — use whatever fits your schema.</p>
              <Code>{`Table users {
  id         int      [pk]
  username   varchar
  email      varchar
  bio        text
  role_id    int      [ref: > roles.id]
  created_at datetime
}`}</Code>
              <Row label="[pk]">Marks column as primary key — shown with a key icon</Row>
              <Row label="Column order">Top-to-bottom matches left-panel definition order</Row>
              <Row label="Types">Any word is valid — int, varchar, text, uuid, decimal, …</Row>
            </Section>

            <Section id="relationships" color="#3b82f6" title="Relationships & References"
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>}>
              <p style={{ marginTop: 0 }}>References define foreign key lines. Use inline syntax on a column, or standalone <KBD>Ref:</KBD> blocks anywhere in the file.</p>
              <Code>{`// Inline — on the column itself
Table orders {
  id      int [pk]
  user_id int [ref: > users.id]   // many-to-one
  item_id int [ref: < items.id]   // one-to-many
}

// Standalone — anywhere in the file
Ref: order_items.order_id   > orders.id
Ref: order_items.product_id > products.id`}</Code>
              <Row label={<><KBD>ref: {">"} table.col</KBD></>}>Many-to-one — crow's foot exits this table</Row>
              <Row label={<><KBD>ref: {"<"} table.col</KBD></>}>One-to-many — crow's foot exits the target</Row>
              <Row label="Drag line midpoint">Hover a line to reveal its grip dot, then drag to reroute</Row>
            </Section>

            <Section id="groups" color="#8b5cf6" title="Table Groups"
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="2" width="9" height="9" rx="1.5"/><rect x="13" y="2" width="9" height="9" rx="1.5"/><rect x="2" y="13" width="9" height="9" rx="1.5"/><rect x="13" y="13" width="9" height="9" rx="1.5"/></svg>}>
              <p style={{ marginTop: 0 }}>Group related tables visually with a <KBD>TableGroup</KBD> block. Each member goes on its own line — just the table name, no punctuation.</p>
              <Code>{`TableGroup Auth {
  users
  roles
  sessions
}

TableGroup Catalog {
  products
  categories
  tags
}`}</Code>
              <Row label="Enable groups">Toggle the <strong>Table Groups</strong> switch in the bottom bar of the canvas</Row>
              <Row label="Group colors">Auto-assigned per group (violet → blue → emerald → amber → …)</Row>
              <Row label="Drag a group">Grab the group label strip at the top of its bounding box to move all member tables together</Row>
              <Row label="Membership">Driven purely by DBML — moving a table out of a group box does not change membership</Row>
            </Section>

            <Section id="canvas" color="#f59e0b" title="Canvas Controls"
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>}>
              <Row label={<><KBD>Ctrl</KBD> + scroll</>}>Zoom in / out</Row>
              <Row label="Click zoom %">Opens a slider + typeable zoom control</Row>
              <Row label="Drag canvas">Pan the diagram (click and drag any empty area)</Row>
              <Row label="Drag table">Reposition any individual table</Row>
              <Row label="Drag line grip">Reroute a relationship line's vertical corridor</Row>
              <Row label="Drag group label">Move all tables in a group at once</Row>
              <Row label="Layout button">Auto-arrange all tables in a grid</Row>
              <Row label="Reset view">Return to 100% zoom at origin</Row>
            </Section>

            <Section id="colors" color="#ec4899" title="Colors & Theming"
              icon={<svg width="13" height="13" viewBox="0 0 20 20"><path d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>}>
              <Row label="Table header color">Click the color wheel icon in a table's header to open the native color picker</Row>
              <Row label="Quick palette">Click any table to reveal a color swatch row in the left panel</Row>
              <Row label="Dark / light mode">Use the sun / moon icon in the toolbar to toggle themes</Row>
              <Row label="Group accent colors">Auto-assigned from a fixed palette based on group order</Row>
            </Section>

            <Section id="saving" color="#06b6d4" title="Saving & Export"
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>}>
              <Row label="Auto-save">All state saves to <KBD>localStorage</KBD> every 400 ms automatically</Row>
              <Row label="Save (.sker)">Toolbar → <strong>Save</strong> — downloads a <KBD>diagram.sker</KBD> JSON file</Row>
              <Row label="Open (.sker)">Toolbar → <strong>Open</strong> — loads a previously saved <KBD>.sker</KBD> file</Row>
              <Row label="Export PNG">Toolbar → <strong>Export</strong> — renders a 2× resolution PNG</Row>
              <p style={{ marginTop: 10, marginBottom: 0 }}>The <KBD>.sker</KBD> file is plain JSON — safe to version in git or share with teammates.</p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniMap({ tablePositions, tableData, colors, canvasOffset, zoom, canvasWidth, canvasHeight, theme, tableWidths }) {
  const MINIMAP_W = 160;
  const MINIMAP_H = 100;
  if (Object.keys(tablePositions).length === 0) return null;

  const allX = Object.values(tablePositions).map((p) => p.x);
  const allY = Object.values(tablePositions).map((p) => p.y);
  const minX = Math.min(...allX) - 50;
  const minY = Math.min(...allY) - 50;
  const maxX = Math.max(...Object.entries(tablePositions).map(([n, p]) => p.x + (tableWidths[n] || TABLE_WIDTH))) + 50;
  const maxY = Math.max(...allY) + 300;
  const worldW = maxX - minX || 1;
  const worldH = maxY - minY || 1;
  const scale = Math.min(MINIMAP_W / worldW, MINIMAP_H / worldH);

  const viewX = (-canvasOffset.x / zoom - minX) * scale;
  const viewY = (-canvasOffset.y / zoom - minY) * scale;
  const viewW = (canvasWidth / zoom) * scale;
  const viewH = (canvasHeight / zoom) * scale;

  return (
    <div
      data-export-hide="1"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        width: MINIMAP_W,
        height: MINIMAP_H,
        background: theme.minimapBg,
        border: `1px solid ${theme.border}`,
        borderRadius: "8px",
        overflow: "hidden",
        zIndex: 20,
        backdropFilter: "blur(8px)",
      }}
    >
      <svg width={MINIMAP_W} height={MINIMAP_H}>
        {Object.entries(tablePositions).map(([name, pos]) => (
          <rect
            key={name}
            x={(pos.x - minX) * scale}
            y={(pos.y - minY) * scale}
            width={(tableWidths[name] || TABLE_WIDTH) * scale}
            height={(HEADER_HEIGHT + (tableData.find((t) => t.name === name)?.columns.length || 1) * COL_HEIGHT) * scale}
            fill={colors[name] || "#10b981"}
            rx="1"
            opacity="0.65"
          />
        ))}
        <rect
          x={viewX} y={viewY} width={viewW} height={viewH}
          fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.8" rx="1"
        />
      </svg>
    </div>
  );
}

function ToggleSwitch({ checked, onChange, theme }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 32, height: 18,
        background: checked ? "#10b981" : theme.toolbarBorder,
        borderRadius: 9,
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute",
        top: 2,
        left: checked ? 16 : 2,
        width: 14, height: 14,
        borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </div>
  );
}

const GROUP_PAD = 22;
const GROUP_LABEL_H = 26;

function GroupOverlay({ groups, tablePositions, tableWidths, tableData, groupsVisible, onGroupDragStart }) {
  if (!groupsVisible || groups.length === 0) return null;

  return (
    <>
      {groups.map((group, gi) => {
        const color = GROUP_ACCENT_COLORS[gi % GROUP_ACCENT_COLORS.length];
        const members = group.tables.filter((n) => tablePositions[n]);
        if (members.length === 0) return null;

        const positions = members.map((n) => ({
          x: tablePositions[n].x,
          y: tablePositions[n].y,
          w: tableWidths[n] || TABLE_WIDTH,
          h: HEADER_HEIGHT + (tableData.find((t) => t.name === n)?.columns.length || 0) * COL_HEIGHT,
        }));

        const minX = Math.min(...positions.map((p) => p.x)) - GROUP_PAD;
        const minY = Math.min(...positions.map((p) => p.y)) - GROUP_PAD - GROUP_LABEL_H;
        const maxX = Math.max(...positions.map((p) => p.x + p.w)) + GROUP_PAD;
        const maxY = Math.max(...positions.map((p) => p.y + p.h)) + GROUP_PAD;
        const bw = maxX - minX;
        const bh = maxY - minY;

        return (
          <g key={group.name}>
            {/* D — Background fill */}
            <rect x={minX} y={minY} width={bw} height={bh} rx="12"
              fill={color} opacity="0.06" style={{ pointerEvents: "none" }} />

            {/* A — Dashed border box */}
            <rect x={minX} y={minY} width={bw} height={bh} rx="12"
              fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="7 4"
              opacity="0.35" style={{ pointerEvents: "none" }} />

            {/* B — Label background pill */}
            <rect x={minX + 12} y={minY + 6} width={group.name.length * 7 + 18} height={20}
              rx="5" fill={color} opacity="0.2" style={{ pointerEvents: "none" }} />

            {/* B — Label text */}
            <text x={minX + 21} y={minY + 19}
              fill={color} fontSize="11" fontWeight="700"
              fontFamily="'DM Sans', sans-serif" letterSpacing="0.4"
              opacity="0.85" style={{ pointerEvents: "none" }}>
              {group.name}
            </text>

            {/* E — Drag hit area (top strip of the group box) */}
            <rect x={minX} y={minY} width={bw} height={GROUP_LABEL_H + 4}
              fill="transparent" rx="12"
              style={{ cursor: "move", pointerEvents: "all" }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onGroupDragStart(group.name, members, e.clientX, e.clientY);
              }}
            />
          </g>
        );
      })}
    </>
  );
}

function BottomGroupPane({ groupsVisible, onToggle, showAllConnections, onToggleConnections, theme }) {
  const divider = (
    <div style={{ width: 1, height: 18, background: theme.toolbarBorder, flexShrink: 0 }} />
  );
  return (
    <div data-export-hide="1" onMouseDown={(e) => e.stopPropagation()} style={{
      position: "absolute",
      bottom: 12,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      background: theme.toolbarBg,
      border: `1px solid ${theme.toolbarBorder}`,
      borderRadius: "10px",
      padding: "8px 16px",
      zIndex: 20,
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
      fontFamily: "'DM Sans', sans-serif",
      fontSize: "12px",
      color: theme.toolbarText,
      fontWeight: 500,
      userSelect: "none",
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="9" height="9" rx="1.5"/>
        <rect x="13" y="2" width="9" height="9" rx="1.5"/>
        <rect x="2" y="13" width="9" height="9" rx="1.5"/>
        <rect x="13" y="13" width="9" height="9" rx="1.5"/>
      </svg>
      <span>Table Groups</span>
      <ToggleSwitch checked={groupsVisible} onChange={onToggle} theme={theme} />
      {divider}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={showAllConnections ? "#10b981" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      <span style={{ color: showAllConnections ? "#10b981" : undefined }}>Highlight Links</span>
      <ToggleSwitch checked={showAllConnections} onChange={onToggleConnections} theme={theme} />
    </div>
  );
}


const STORAGE_KEY = "sketcher-state";

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function SketchER() {
  const saved = useRef(loadSavedState()).current;

  const [isDark, setIsDark] = useState(saved?.isDark ?? false);
  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  const [fileName, setFileName] = useState(saved?.fileName ?? "Untitled");
  const [editingFileName, setEditingFileName] = useState(false);
  const fileNameInputRef = useRef(null);
  const pendingFitRef = useRef(false);
  const hasFittedRef = useRef(false);

  const [dbml, setDbml] = useState(saved?.dbml ?? DEFAULT_DBML);
  const [tablePositions, setTablePositions] = useState(saved?.tablePositions ?? {});
  const [tableColors, setTableColors] = useState(saved?.tableColors ?? {});
  const [selectedTables, setSelectedTables] = useState(new Set());
  const [hoveredTable, setHoveredTable] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [draggingLine, setDraggingLine] = useState(null); // { pathKey, startClientX, startMidX }
  const [lineMidXOverrides, setLineMidXOverrides] = useState(saved?.lineMidXOverrides ?? {});
  const [groupsVisible, setGroupsVisible] = useState(saved?.groupsVisible ?? false);
  const [draggingGroup, setDraggingGroup] = useState(null);
  const [showHelp, setShowHelp] = useState(false); // { memberTables, startClientX, startClientY, startPositions }
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [editorWidth, setEditorWidth] = useState(370);
  const [isResizing, setIsResizing] = useState(false);
  const canvasRef = useRef(null);
  const transformRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [showAllConnections, setShowAllConnections] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [jumpToTableOnClick, setJumpToTableOnClick] = useState(saved?.jumpToTableOnClick ?? false);
  const highlightRef = useRef(null);
  const [glowLines, setGlowLines] = useState(null); // { start, end }

  const { tables, refs, groups } = useMemo(() => parseDBML(dbml), [dbml]);

  // Which columns to highlight per table when a table is hovered
  const activeColumns = useMemo(() => {
    if (!hoveredTable) return {};
    const map = {};
    for (const ref of refs) {
      if (ref.from.table === hoveredTable || ref.to.table === hoveredTable) {
        if (!map[ref.from.table]) map[ref.from.table] = new Set();
        map[ref.from.table].add(ref.from.column);
        if (!map[ref.to.table]) map[ref.to.table] = new Set();
        map[ref.to.table].add(ref.to.column);
      }
    }
    return map;
  }, [hoveredTable, refs]);

  // Tables connected to the hovered table (for dimming)
  const connectedToHovered = useMemo(() => {
    if (!hoveredTable) return null;
    const connected = new Set([hoveredTable]);
    for (const ref of refs) {
      if (ref.from.table === hoveredTable) connected.add(ref.to.table);
      if (ref.to.table === hoveredTable) connected.add(ref.from.table);
    }
    return connected;
  }, [hoveredTable, refs]);

  // Which columns are FK (many) side
  const fkMap = useMemo(() => {
    const map = {};
    for (const ref of refs) {
      if (!map[ref.from.table]) map[ref.from.table] = new Set();
      map[ref.from.table].add(ref.from.column);
    }
    return map;
  }, [refs]);

  // Compute per-table widths based on actual text content
  const tableWidths = useMemo(() => {
    const cvs = document.createElement("canvas");
    const ctx = cvs.getContext("2d");
    const measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
    const MIN_W = 200;
    const PAD = 12; // horizontal padding on each side

    const widths = {};
    for (const table of tables) {
      // Header: pill left pad + name + pill right pad + gap + wheel + right edge
      const headerW = PAD + measure(table.name, "700 12px 'DM Sans', sans-serif") + PAD + PAD + 18 + PAD;

      let maxW = Math.max(MIN_W, Math.ceil(headerW));
      for (const col of table.columns) {
        const isFk = fkMap[table.name]?.has(col.name);
        const iconW = col.isPk || isFk ? 17 : 0; // 11px icon + 6px gap
        const nameW = measure(col.name, `${col.isPk ? "600" : "400"} 12.5px 'DM Sans', sans-serif`);
        const typeW = measure(col.type, "400 11px 'JetBrains Mono', monospace");
        const rowW = PAD + iconW + nameW + 20 + typeW + PAD;
        maxW = Math.max(maxW, Math.ceil(rowW));
      }
      widths[table.name] = maxW;
    }
    return widths;
  }, [tables, fkMap]);

  // Auto-save to localStorage on every meaningful change
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ dbml, tablePositions, tableColors, isDark, lineMidXOverrides, groupsVisible, fileName, jumpToTableOnClick }));
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [dbml, tablePositions, tableColors, isDark, lineMidXOverrides, groupsVisible, fileName, jumpToTableOnClick]);

  // Save diagram to a .sker file
  const saveToFile = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify({ dbml, tablePositions, tableColors, isDark, lineMidXOverrides, groupsVisible }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = fileName === "Untitled" ? "diagram" : fileName;
    link.download = baseName.endsWith(".sker") ? baseName : `${baseName}.sker`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    if (fileName === "Untitled") setFileName("diagram");
  }, [dbml, tablePositions, tableColors, isDark, lineMidXOverrides, groupsVisible, fileName]);

  // Load diagram from a .sker / .json file
  const loadInputRef = useRef(null);
  const handleLoadFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const state = JSON.parse(evt.target.result);
        if (state.dbml !== undefined)              setDbml(state.dbml);
        if (state.tablePositions !== undefined)    setTablePositions(state.tablePositions);
        if (state.tableColors !== undefined)       setTableColors(state.tableColors);
        if (state.isDark !== undefined)            setIsDark(state.isDark);
        if (state.lineMidXOverrides !== undefined) setLineMidXOverrides(state.lineMidXOverrides);
        if (state.groupsVisible !== undefined)     setGroupsVisible(state.groupsVisible);
        setFileName(file.name.replace(/\.(sker|json)$/i, ""));
        pendingFitRef.current = true;
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const exportToPng = useCallback(async () => {
    const { default: html2canvas } = await import("html2canvas");
    const outerEl = canvasRef.current;
    if (!outerEl || !Object.keys(tablePositions).length) return;

    // ── Bounding box of all table content ────────────────────────────────────
    const PAD = 80;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const name of Object.keys(tablePositions)) {
      const pos = tablePositions[name];
      const td  = tables.find((t) => t.name === name);
      if (!pos || !td) continue;
      const w = tableWidths[name] || TABLE_WIDTH;
      const h = HEADER_HEIGHT + td.columns.length * COL_HEIGHT;
      minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + w); maxY = Math.max(maxY, pos.y + h);
    }
    // Extra room for lines that route outside table edges
    minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
    const W = Math.ceil(maxX - minX);
    const H = Math.ceil(maxY - minY);

    // ── Clone the canvas area off-screen ─────────────────────────────────────
    const clone = outerEl.cloneNode(true);
    clone.style.cssText = [
      `position:fixed`,
      `top:-${H + 200}px`,
      `left:0`,
      `width:${W}px`,
      `height:${H}px`,
      `overflow:hidden`,
      `pointer-events:none`,
    ].join(";");

    // Reset the inner transform so content starts at (0,0) in the clone
    const cloneInner = clone.querySelector("[data-transform-container]");
    if (cloneInner) {
      cloneInner.style.transform = `translate(${-minX}px,${-minY}px) scale(1)`;
    }

    // Remove UI overlays (toolbar, minimap, filename, bottom pane)
    clone.querySelectorAll("[data-export-hide]").forEach((el) => el.remove());

    document.body.appendChild(clone);
    // Two frames — let the browser lay out and paint the clone
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await html2canvas(clone, {
      backgroundColor: isDark ? "#1e1e1e" : "#f5f5f5",
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      width: W,
      height: H,
    });

    document.body.removeChild(clone);

    const link = document.createElement("a");
    link.download = `${fileName || "diagram"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [tablePositions, tables, tableWidths, isDark, fileName]);

  useEffect(() => {
    setTablePositions((prev) => {
      const next = { ...prev };
      let needsUpdate = false;
      const cols = Math.ceil(Math.sqrt(tables.length));
      tables.forEach((t, i) => {
        if (!next[t.name]) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          next[t.name] = { x: 60 + col * (TABLE_WIDTH + 90), y: 60 + row * 290 };
          needsUpdate = true;
        }
      });
      for (const key of Object.keys(next)) {
        if (!tables.find((t) => t.name === key)) {
          delete next[key];
          needsUpdate = true;
        }
      }
      return needsUpdate ? next : prev;
    });
    setTableColors((prev) => {
      const next = { ...prev };
      let needsUpdate = false;
      tables.forEach((t, i) => {
        if (!next[t.name]) {
          next[t.name] = TABLE_COLORS[i % TABLE_COLORS.length];
          needsUpdate = true;
        }
      });
      return needsUpdate ? next : prev;
    });
  }, [tables]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleDragStart = useCallback((tableName, clientX, clientY) => {
    const pos = tablePositions[tableName];
    if (!pos) return;
    setDragging({
      table: tableName,
      offsetX: clientX / zoom - pos.x - canvasOffset.x / zoom,
      offsetY: clientY / zoom - pos.y - canvasOffset.y / zoom,
    });
  }, [tablePositions, zoom, canvasOffset]);

  const handleCanvasMouseDown = (e) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y });
    setSelectedTables(new Set());
  };

  const handleLineDragStart = useCallback((pathKey, clientX, currentMidX) => {
    setDraggingLine({ pathKey, startClientX: clientX, startMidX: currentMidX });
  }, []);

  const handleGroupDragStart = useCallback((groupName, memberTables, clientX, clientY) => {
    const startPositions = {};
    for (const name of memberTables) {
      if (tablePositions[name]) startPositions[name] = { ...tablePositions[name] };
    }
    setDraggingGroup({ groupName, memberTables, startClientX: clientX, startClientY: clientY, startPositions });
  }, [tablePositions]);

  const handleMouseMove = useCallback((e) => {
    if (draggingGroup) {
      const dx = (e.clientX - draggingGroup.startClientX) / zoom;
      const dy = (e.clientY - draggingGroup.startClientY) / zoom;
      setTablePositions((prev) => {
        const next = { ...prev };
        for (const name of draggingGroup.memberTables) {
          const start = draggingGroup.startPositions[name];
          if (start) next[name] = { x: start.x + dx, y: start.y + dy };
        }
        return next;
      });
    } else if (draggingLine) {
      const dx = (e.clientX - draggingLine.startClientX) / zoom;
      setLineMidXOverrides((prev) => ({
        ...prev,
        [draggingLine.pathKey]: draggingLine.startMidX + dx,
      }));
    } else if (dragging) {
      setTablePositions((prev) => ({
        ...prev,
        [dragging.table]: {
          x: e.clientX / zoom - dragging.offsetX - canvasOffset.x / zoom,
          y: e.clientY / zoom - dragging.offsetY - canvasOffset.y / zoom,
        },
      }));
    } else if (isPanning && panStart) {
      setCanvasOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (isResizing) {
      setEditorWidth(Math.max(260, Math.min(600, e.clientX)));
    }
  }, [draggingGroup, draggingLine, dragging, isPanning, panStart, zoom, canvasOffset, isResizing]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setDraggingLine(null);
    setDraggingGroup(null);
    setIsPanning(false);
    setPanStart(null);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.max(0.25, Math.min(2, z + delta)));
    }
  };

  const autoLayout = () => {
    const cols = Math.ceil(Math.sqrt(tables.length));
    const newPos = {};
    tables.forEach((t, i) => {
      newPos[t.name] = {
        x: 60 + (i % cols) * (TABLE_WIDTH + 100),
        y: 60 + Math.floor(i / cols) * 300,
      };
    });
    setTablePositions(newPos);
  };

  const resetView = () => {
    setCanvasOffset({ x: 0, y: 0 });
    setZoom(1);
  };

  const fitToCanvas = useCallback(() => {
    const tableNames = Object.keys(tablePositions);
    if (tableNames.length === 0 || canvasSize.w === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const name of tableNames) {
      const pos = tablePositions[name];
      const td = tables.find((t) => t.name === name);
      if (!pos || !td) continue;
      const w = tableWidths[name] || TABLE_WIDTH;
      const h = HEADER_HEIGHT + td.columns.length * COL_HEIGHT;
      minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + w); maxY = Math.max(maxY, pos.y + h);
    }
    if (!isFinite(minX)) return;
    const PAD = 60;
    const contentW = maxX - minX + PAD * 2;
    const contentH = maxY - minY + PAD * 2;
    const newZoom = Math.max(0.25, Math.min(2, Math.min(canvasSize.w / contentW, canvasSize.h / contentH)));
    setZoom(newZoom);
    setCanvasOffset({
      x: (canvasSize.w - contentW * newZoom) / 2 - (minX - PAD) * newZoom,
      y: (canvasSize.h - contentH * newZoom) / 2 - (minY - PAD) * newZoom,
    });
  }, [tablePositions, tables, tableWidths, canvasSize]);

  // Auto-fit on initial load and after file load
  useEffect(() => {
    const hasPositions = Object.keys(tablePositions).length > 0;
    if (!hasPositions || canvasSize.w === 0) return;
    if (!hasFittedRef.current || pendingFitRef.current) {
      hasFittedRef.current = true;
      pendingFitRef.current = false;
      fitToCanvas();
    }
  }, [tablePositions, canvasSize, fitToCanvas]);

  const handleColorChange = (tableName, color) => {
    setTableColors((prev) => ({ ...prev, [tableName]: color }));
  };

  const handleTableSelect = useCallback((tableName, isMulti) => {
    if (isMulti) {
      setSelectedTables((prev) => {
        const next = new Set(prev);
        if (next.has(tableName)) next.delete(tableName);
        else next.add(tableName);
        return next;
      });
    } else {
      setSelectedTables(new Set([tableName]));
    }
    // Jump to table definition in editor + glow highlight
    if (jumpToTableOnClick && editorRef.current) {
      const regex = new RegExp(`^\\s*Table\\s+${tableName}\\s*\\{`, "im");
      const match = regex.exec(dbml);
      if (match) {
        const startLine = dbml.substring(0, match.index).split("\n").length - 1;
        const lineHeight = 20;
        editorRef.current.scrollTop = startLine * lineHeight;
        // Find the closing brace to get end line
        const closingIndex = dbml.indexOf("}", match.index + match[0].length);
        const endLine = closingIndex !== -1
          ? dbml.substring(0, closingIndex + 1).split("\n").length - 1
          : startLine;
        setGlowLines({ start: startLine, end: endLine });
        setTimeout(() => setGlowLines(null), 1200);
      }
    }
  }, [jumpToTableOnClick, dbml]);

  const handlePaletteColorClick = useCallback((color) => {
    const names = [...selectedTables];
    if (names.length === 0) return;
    if (names.length === 1) {
      handleColorChange(names[0], color);
    } else {
      const variants = generateHueFamily(color, names.length);
      setTableColors((prev) => {
        const next = { ...prev };
        names.forEach((name, i) => { next[name] = variants[i]; });
        return next;
      });
    }
  }, [selectedTables]);

  const [lineNumbers, setLineNumbers] = useState([]);
  useEffect(() => {
    setLineNumbers(dbml.split("\n").map((_, i) => i + 1));
  }, [dbml]);

  const highlightedHtml = useMemo(() => highlightDBML(dbml, theme, glowLines), [dbml, theme, glowLines]);

  const editorRef = useRef(null);
  const lineNumRef = useRef(null);
  const handleEditorScroll = () => {
    if (editorRef.current) {
      if (lineNumRef.current) lineNumRef.current.scrollTop = editorRef.current.scrollTop;
      if (highlightRef.current) {
        highlightRef.current.scrollTop = editorRef.current.scrollTop;
        highlightRef.current.scrollLeft = editorRef.current.scrollLeft;
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        background: theme.appBg,
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        color: theme.textPrimary,
        overflow: "hidden",
      }}
    >
      {/* ===== Editor Panel ===== */}
      <div
        style={{
          width: editorWidth,
          minWidth: 260,
          display: "flex",
          flexDirection: "column",
          background: theme.editorPanelBg,
          borderRight: `1px solid ${theme.border}`,
          flexShrink: 0,
        }}
      >
        {/* Logo / Header */}
        <div
          style={{
            padding: "16px 18px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: theme.editorHeaderBg,
          }}
        >
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <rect x="2" y="2" width="28" height="28" rx="6" fill="#10b981" />
            <line x1="2" y1="11" x2="30" y2="11" stroke="white" strokeWidth="2.5" />
            <line x1="11" y1="11" x2="11" y2="30" stroke="white" strokeWidth="1.8" opacity="0.5" />
            <circle cx="6.5" cy="6.5" r="1.8" fill="white" opacity="0.8" />
            <circle cx="16" cy="6.5" r="1.8" fill="white" opacity="0.4" />
          </svg>
          <div>
            <span style={{ fontWeight: 700, fontSize: "17px", letterSpacing: "0.3px", color: theme.textPrimary }}>
              Sketch<span style={{ color: "#10b981" }}>ER</span>
            </span>
            <div style={{ fontSize: "10px", color: theme.textMuted, marginTop: "-1px", letterSpacing: "0.5px" }}>
              Entity Relationship Diagrams
            </div>
          </div>
          <span
            style={{
              marginLeft: "auto",
              fontSize: "9px",
              color: "#10b981",
              background: "#10b98115",
              padding: "3px 8px",
              borderRadius: "4px",
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            DBML
          </span>
          {/* Settings gear */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowSettings((v) => !v)}
              title="Settings"
              style={{
                background: showSettings ? `${theme.textMuted}22` : "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.textSecondary,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            {showSettings && (
              <div style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                background: theme.toolbarBg,
                border: `1px solid ${theme.toolbarBorder}`,
                borderRadius: "10px",
                padding: "14px 16px",
                zIndex: 50,
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "12px",
                color: theme.textPrimary,
                minWidth: "220px",
              }}>
                <div style={{ fontWeight: 700, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.textMuted, marginBottom: "12px" }}>
                  Settings
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}>
                  <ToggleSwitch checked={jumpToTableOnClick} onChange={() => setJumpToTableOnClick((v) => !v)} theme={theme} />
                  <span style={{ fontSize: "12.5px", fontWeight: 500 }}>Jump to table code on click</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Color palette (when table selected) */}
        {selectedTables.size > 0 && (
          <div
            style={{
              padding: "10px 18px",
              borderBottom: `1px solid ${theme.border}`,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              background: theme.colorPaletteRowBg,
              fontSize: "11px",
            }}
          >
            <span style={{ color: theme.textSecondary, fontWeight: 600, fontSize: "11.5px" }}>
              {selectedTables.size === 1 ? [...selectedTables][0] : `${selectedTables.size} tables selected`}
            </span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {TABLE_COLORS.map((c) => (
              <div
                key={c}
                onClick={() => handlePaletteColorClick(c)}
                title={selectedTables.size > 1 ? "Apply hue family" : undefined}
                style={{
                  width: 19,
                  height: 19,
                  borderRadius: "50%",
                  background: c,
                  cursor: "pointer",
                  border: selectedTables.size === 1 && tableColors[[...selectedTables][0]] === c
                    ? `2.5px solid ${isDark ? "#fff" : "#1e1e1e"}`
                    : "2.5px solid transparent",
                  transition: "all 0.15s",
                  flexShrink: 0,
                }}
              />
            ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div
          style={{
            padding: "8px 18px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            gap: "18px",
            fontSize: "11px",
            color: theme.statText,
            fontWeight: 500,
          }}
        >
          <span><span style={{ color: "#10b981", fontWeight: 700 }}>{tables.length}</span> tables</span>
          <span><span style={{ color: "#8b5cf6", fontWeight: 700 }}>{refs.length}</span> refs</span>
          <span>
            <span style={{ color: "#3b82f6", fontWeight: 700 }}>
              {tables.reduce((s, t) => s + t.columns.length, 0)}
            </span> cols
          </span>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div
            ref={lineNumRef}
            style={{
              width: "42px",
              padding: "14px 6px 14px 0",
              textAlign: "right",
              color: theme.lineNumberColor,
              fontSize: "12px",
              lineHeight: "20px",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              overflow: "hidden",
              userSelect: "none",
              borderRight: `1px solid ${theme.lineNumberBorder}`,
              flexShrink: 0,
              background: theme.editorPanelBg,
            }}
          >
            {lineNumbers.map((n) => <div key={n}>{n}</div>)}
          </div>
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {/* Syntax-highlighted underlay */}
            <pre
              ref={highlightRef}
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: highlightedHtml + "\n" }}
              style={{
                position: "absolute",
                inset: 0,
                margin: 0,
                padding: "14px",
                fontSize: "12.5px",
                lineHeight: "20px",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                tabSize: 2,
                letterSpacing: "0.3px",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                overflow: "auto",
                pointerEvents: "none",
                background: theme.editorPanelBg,
                color: theme.editorText,
              }}
            />
            {/* Transparent textarea on top for editing */}
            <textarea
              ref={editorRef}
              value={dbml}
              onChange={(e) => setDbml(e.target.value)}
              onScroll={handleEditorScroll}
              spellCheck={false}
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                background: "transparent",
                color: "transparent",
                caretColor: theme.editorText,
                border: "none",
                outline: "none",
                resize: "none",
                padding: "14px",
                fontSize: "12.5px",
                lineHeight: "20px",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                tabSize: 2,
                letterSpacing: "0.3px",
                zIndex: 1,
              }}
            />
          </div>
        </div>

        {/* Help footer */}
        <div
          style={{
            padding: "10px 18px",
            borderTop: `1px solid ${theme.border}`,
            fontSize: "10px",
            color: theme.textMuted,
            lineHeight: "1.7",
            background: theme.footerBg,
          }}
        >
          <strong style={{ color: theme.textSecondary }}>Syntax:</strong>{" "}
          Table name {"{ "}col type [pk] [ref: {">"} table.col]{" }"}
          <br />
          Ctrl+Scroll to zoom · Drag canvas to pan · Hover table to highlight
          <div style={{ marginTop: "8px", borderTop: `1px solid ${theme.border}`, paddingTop: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
            <span>Made by</span>
            <a
              href="https://github.com/Puru-Singh"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#10b981", textDecoration: "none", fontWeight: 600 }}
            >
              Puru Singh
            </a>
            <svg width="10" height="10" viewBox="0 0 24 24" fill={theme.textMuted} style={{ flexShrink: 0 }}>
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </div>
        </div>
      </div>

      {/* ===== Resize Handle ===== */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
        style={{
          width: "5px",
          cursor: "col-resize",
          background: isResizing ? "#10b981" : "transparent",
          transition: "background 0.15s",
          flexShrink: 0,
          zIndex: 30,
        }}
        onMouseEnter={(e) => (e.target.style.background = theme.resizeHandleHover)}
        onMouseLeave={(e) => { if (!isResizing) e.target.style.background = "transparent"; }}
      />

      {/* ===== Canvas ===== */}
      <div
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          cursor: isPanning ? "move" : "default",
          background: theme.canvasBg,
        }}
      >
        {/* Dot grid */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <defs>
            <pattern
              id="grid"
              width={28 * zoom}
              height={28 * zoom}
              patternUnits="userSpaceOnUse"
              x={canvasOffset.x % (28 * zoom)}
              y={canvasOffset.y % (28 * zoom)}
            >
              <circle cx="1" cy="1" r="0.7" fill={theme.dotColor} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Filename display / edit */}
        <div
          data-export-hide="1"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: theme.toolbarBg,
            border: `1px solid ${editingFileName ? "#10b981" : theme.toolbarBorder}`,
            borderRadius: "8px",
            padding: "7px 12px",
            zIndex: 20,
            fontSize: "12px",
            color: theme.toolbarText,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
            userSelect: "none",
            transition: "border-color 0.15s",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          {editingFileName ? (
            <input
              ref={fileNameInputRef}
              defaultValue={fileName}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v) setFileName(v);
                setEditingFileName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.target.blur();
                if (e.key === "Escape") { setEditingFileName(false); }
              }}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                color: theme.toolbarText,
                fontSize: "12px",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                width: `${Math.max(60, fileName.length * 7.5)}px`,
                padding: 0,
              }}
            />
          ) : (
            <span
              onClick={() => {
                setEditingFileName(true);
                setTimeout(() => {
                  fileNameInputRef.current?.select();
                }, 0);
              }}
              title="Click to rename"
              style={{ cursor: "text" }}
            >
              {fileName}
            </span>
          )}
        </div>

        <Toolbar
          onAutoLayout={autoLayout}
          onResetView={resetView}
          onFit={fitToCanvas}
          onZoomIn={() => setZoom((z) => Math.min(2, z + 0.1))}
          onZoomOut={() => setZoom((z) => Math.max(0.25, z - 0.1))}
          onZoomSet={(v) => setZoom(Math.max(0.25, Math.min(2, v)))}
          zoom={zoom}
          isDark={isDark}
          onToggleTheme={() => setIsDark((d) => !d)}
          theme={theme}
          onExport={exportToPng}
          onSave={saveToFile}
          onLoad={() => loadInputRef.current?.click()}
          onShowHelp={() => setShowHelp(true)}
        />

        {/* Transform container */}
        <div
          ref={transformRef}
          data-transform-container="1"
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <svg
            style={{
              position: "absolute",
              top: 0, left: 0,
              width: "6000px", height: "6000px",
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            <GroupOverlay
              groups={groups}
              tablePositions={tablePositions}
              tableWidths={tableWidths}
              tableData={tables}
              groupsVisible={groupsVisible}
              onGroupDragStart={handleGroupDragStart}
            />
            <RelationshipLines
              refs={refs}
              tablePositions={tablePositions}
              tableData={tables}
              theme={theme}
              hoveredTable={hoveredTable}
              selectedTables={selectedTables}
              showAllConnections={showAllConnections}
              tableColors={tableColors}
              tableWidths={tableWidths}
              lineMidXOverrides={lineMidXOverrides}
              onLineDragStart={handleLineDragStart}
            />
          </svg>

          {tables.map((table) =>
            tablePositions[table.name] ? (
              <TableNode
                key={table.name}
                table={table}
                position={tablePositions[table.name]}
                color={tableColors[table.name] || "#10b981"}
                onDragStart={handleDragStart}
                onColorChange={handleColorChange}
                isSelected={selectedTables.has(table.name)}
                onSelect={handleTableSelect}
                theme={theme}
                fkColumns={fkMap[table.name]}
                activeColumns={activeColumns[table.name]}
                onHover={setHoveredTable}
                width={tableWidths[table.name]}
                isDimmed={!showAllConnections && connectedToHovered !== null && !connectedToHovered.has(table.name)}
              />
            ) : null
          )}
        </div>

        <MiniMap
          tablePositions={tablePositions}
          tableData={tables}
          colors={tableColors}
          canvasOffset={canvasOffset}
          zoom={zoom}
          canvasWidth={canvasSize.w}
          canvasHeight={canvasSize.h}
          theme={theme}
          tableWidths={tableWidths}
        />

        {/* Empty state */}
        {tables.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: theme.emptyStateColor,
              gap: "14px",
              pointerEvents: "none",
            }}
          >
            <svg width="52" height="52" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="1.5" />
              <line x1="2" y1="11" x2="30" y2="11" stroke="currentColor" strokeWidth="1.5" />
              <line x1="11" y1="11" x2="11" y2="30" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            </svg>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>
              Write DBML in the editor to create tables
            </span>
          </div>
        )}

        <BottomGroupPane
          groupsVisible={groupsVisible}
          onToggle={() => setGroupsVisible((v) => !v)}
          showAllConnections={showAllConnections}
          onToggleConnections={() => setShowAllConnections((v) => !v)}
          theme={theme}
        />

        {showHelp && <InfoModal theme={theme} onClose={() => setShowHelp(false)} />}

        {/* Hidden file input for Open */}
        <input
          ref={loadInputRef}
          type="file"
          accept=".sker,.json"
          onChange={handleLoadFile}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}
