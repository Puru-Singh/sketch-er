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
  "#10b981", "#3b82f6", "#8b5cf6", "#ef4444",
  "#f59e0b", "#ec4899", "#06b6d4", "#f97316",
  "#6366f1", "#14b8a6", "#e11d48", "#84cc16",
];

const GROUP_ACCENT_COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];

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

const COL_HEIGHT = 32;
const HEADER_HEIGHT = 42;
const TABLE_WIDTH = 230;

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

function RelationshipLines({ refs, tablePositions, tableData, theme, hoveredTable, tableColors, tableWidths, lineMidXOverrides, onLineDragStart }) {
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
    const isActive = hoveredTable === ref.from.table || hoveredTable === ref.to.table;
    const lineColor = isActive
      ? (tableColors[ref.from.table] || theme.lineColor)
      : theme.lineColor;
    const opacity = hoveredTable && !isActive ? 0.18 : 1;

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

        {/* Animated dot — moves PK → FK (reversed) */}
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
      style={{ display: "block", opacity: lit ? 1 : 0.28, transition: "opacity 0.15s", pointerEvents: "none" }}>
      {COLOR_WHEEL_SEGS.map((s) => <path key={s.color} d={s.d} fill={s.color} />)}
    </svg>
  );
}

function TableNode({ table, position, color, onDragStart, onColorChange, isSelected, onSelect, theme, fkColumns, activeColumns, onHover, width }) {
  const [pickerHovered, setPickerHovered] = useState(false);
  const [pickerFocused, setPickerFocused] = useState(false);
  const pickerLit = pickerHovered || pickerFocused;

  const handleMouseDown = (e) => {
    if (e.target.closest(".color-picker-area")) return;
    e.stopPropagation();
    onSelect(table.name);
    onDragStart(table.name, e.clientX, e.clientY);
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
        transition: "box-shadow 0.15s ease",
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
          justifyContent: "space-between",
          padding: "0 12px",
          fontWeight: 700,
          fontSize: "13px",
          color: "#fff",
          letterSpacing: "0.2px",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <span>{table.name}</span>
        <div
          className="color-picker-area"
          style={{ position: "relative", width: 18, height: 18 }}
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

function Tooltip({ text, theme }) {
  return (
    <div style={{
      position: "absolute",
      top: "calc(100% + 10px)",
      left: "50%",
      transform: "translateX(-50%)",
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

function TBtn({ onClick, tip, theme, children, style = {} }) {
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
      {hovered && tip && <Tooltip text={tip} theme={theme} />}
    </button>
  );
}

function Toolbar({ onAutoLayout, onZoomIn, onZoomOut, zoom, onResetView, isDark, onToggleTheme, theme, onExport, onSave, onLoad, onShowHelp }) {
  const staticSpan = {
    padding: "7px 12px",
    background: theme.toolbarBg,
    border: `1px solid ${theme.toolbarBorder}`,
    borderRadius: "8px",
    color: theme.toolbarText,
    fontSize: "11px",
    display: "flex",
    alignItems: "center",
    cursor: "default",
    minWidth: "50px",
    justifyContent: "center",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 500,
  };
  return (
    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: "6px", zIndex: 20 }}>
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
      <span style={staticSpan}>{Math.round(zoom * 100)}%</span>
      <TBtn onClick={onZoomIn} tip="Zoom in" theme={theme}>+</TBtn>
      <TBtn onClick={onResetView} tip="Reset view" theme={theme}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 12a9 9 0 1 1 3 6.7" /><path d="M3 21v-6h6" />
        </svg>
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
      <TBtn onClick={onShowHelp} tip="Help & reference" theme={theme}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </TBtn>
    </div>
  );
}

function InfoModal({ theme, onClose }) {
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

  const Section = ({ color, icon, title, children }) => (
    <div style={{ marginBottom: "28px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        marginBottom: "12px",
        paddingBottom: "8px",
        borderBottom: `1px solid ${theme.border}`,
      }}>
        <span style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 26, height: 26, borderRadius: "7px",
          background: color + "22", color,
          flexShrink: 0,
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
      <span style={{ color: theme.textMuted, flexShrink: 0, minWidth: 160, fontSize: "12px" }}>{label}</span>
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
          width: "min(760px, 94vw)",
          maxHeight: "82vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
          overflow: "hidden",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px 16px",
          borderBottom: `1px solid ${theme.border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ fontWeight: 700, fontSize: "15px", color: theme.textPrimary, letterSpacing: "0.1px" }}>
              SketchER Reference
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: theme.textMuted, fontSize: "20px", lineHeight: 1,
              padding: "2px 6px", borderRadius: "6px",
              transition: "color 0.15s",
            }}
          >×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "24px 28px" }}>

          {/* Tables */}
          <Section color="#10b981" title="Creating Tables"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>}>
            <p style={{ marginTop: 0 }}>Each table block defines a database table. Column types are free-form strings — use whatever fits your schema.</p>
            <Code>{`Table users {
  id       int      [pk]
  username varchar
  email    varchar
  bio      text
  role_id  int      [ref: > roles.id]
  created_at datetime
}`}</Code>
            <Row label="[pk]">Marks column as primary key — shown with a key icon</Row>
            <Row label="Column order">Top-to-bottom matches left-panel definition order</Row>
            <Row label="Types">Any word is valid — int, varchar, text, uuid, decimal, …</Row>
          </Section>

          {/* Relationships */}
          <Section color="#3b82f6" title="Relationships & References"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>}>
            <p style={{ marginTop: 0 }}>References define foreign key lines between tables. Use inline syntax inside a column, or standalone <KBD>Ref:</KBD> blocks anywhere.</p>
            <Code>{`// Inline — on the column itself
Table orders {
  id      int [pk]
  user_id int [ref: > users.id]   // many-to-one  (crow's foot on orders side)
  item_id int [ref: < items.id]   // one-to-many
}

// Standalone — anywhere in the file
Ref: order_items.order_id > orders.id
Ref: order_items.product_id > products.id`}</Code>
            <Row label={<><KBD>ref: {">"} table.col</KBD></>}>Many-to-one — crow's foot exits this table</Row>
            <Row label={<><KBD>ref: {"<"} table.col</KBD></>}>One-to-many — crow's foot exits the target table</Row>
            <Row label="Drag line midpoint">Hover a relationship line to reveal its grip dot, then drag to reroute</Row>
          </Section>

          {/* Table Groups */}
          <Section color="#8b5cf6" title="Table Groups"
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

          {/* Canvas controls */}
          <Section color="#f59e0b" title="Canvas Controls"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>}>
            <Row label={<><KBD>Ctrl</KBD> + scroll</>}>Zoom in / out</Row>
            <Row label="Drag canvas">Pan the diagram (click and drag on any empty area)</Row>
            <Row label="Drag table">Reposition any table on the canvas</Row>
            <Row label="Drag line grip">Reroute a relationship line's vertical corridor</Row>
            <Row label="Drag group label">Move all tables in a group at once</Row>
            <Row label="Layout button">Auto-arrange all tables in a grid</Row>
            <Row label="Reset view">Return to 100% zoom at origin</Row>
          </Section>

          {/* Colors & theming */}
          <Section color="#ec4899" title="Colors & Theming"
            icon={<svg width="13" height="13" viewBox="0 0 20 20"><path d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>}>
            <Row label="Table header color">Click the color wheel icon (●) in a table's header to open the native color picker</Row>
            <Row label="Quick palette">Click any table to reveal a color swatch row in the left panel — pick a preset instantly</Row>
            <Row label="Dark / light mode">Use the sun / moon icon in the toolbar to toggle themes</Row>
            <Row label="Group accent colors">Auto-assigned from a fixed palette based on group order — not currently user-editable</Row>
          </Section>

          {/* Saving */}
          <Section color="#06b6d4" title="Saving & Export"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>}>
            <Row label="Auto-save">Diagram state (DBML, positions, colors, theme, groups toggle) is automatically saved to <KBD>localStorage</KBD> every 400 ms</Row>
            <Row label="Save (.sker)">Toolbar → <strong>Save</strong> — downloads a <KBD>diagram.sker</KBD> JSON file containing all state</Row>
            <Row label="Open (.sker)">Toolbar → <strong>Open</strong> — loads a previously saved <KBD>.sker</KBD> file and restores full state</Row>
            <Row label="Export PNG">Toolbar → <strong>Export</strong> — renders the diagram to a 2× resolution PNG and downloads it</Row>
            <p style={{ marginTop: 8, marginBottom: 0 }}>The <KBD>.sker</KBD> file format is plain JSON — you can version it in git or share it with teammates.</p>
          </Section>

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

function BottomGroupPane({ groupsVisible, onToggle, theme }) {
  return (
    <div style={{
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
    </div>
  );
}

// Canvas2D rounded-rect helper
function canvasRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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

  const [dbml, setDbml] = useState(saved?.dbml ?? DEFAULT_DBML);
  const [tablePositions, setTablePositions] = useState(saved?.tablePositions ?? {});
  const [tableColors, setTableColors] = useState(saved?.tableColors ?? {});
  const [selectedTable, setSelectedTable] = useState(null);
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
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

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
      // Header: name + gap + color circle
      const headerW = PAD + measure(table.name, "bold 13px 'DM Sans', sans-serif") + 10 + 20 + PAD;

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
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ dbml, tablePositions, tableColors, isDark, lineMidXOverrides, groupsVisible }));
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [dbml, tablePositions, tableColors, isDark]);

  // Save diagram to a .sker file
  const saveToFile = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify({ dbml, tablePositions, tableColors, isDark, lineMidXOverrides, groupsVisible }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "diagram.sker";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [dbml, tablePositions, tableColors, isDark, lineMidXOverrides]);

  // Load diagram from a .sker / .json file
  const loadInputRef = useRef(null);
  const handleLoadFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const state = JSON.parse(evt.target.result);
        if (state.dbml !== undefined)          setDbml(state.dbml);
        if (state.tablePositions !== undefined) setTablePositions(state.tablePositions);
        if (state.tableColors !== undefined)    setTableColors(state.tableColors);
        if (state.isDark !== undefined)              setIsDark(state.isDark);
        if (state.lineMidXOverrides !== undefined)   setLineMidXOverrides(state.lineMidXOverrides);
        if (state.groupsVisible !== undefined)       setGroupsVisible(state.groupsVisible);
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const exportToPng = useCallback(async () => {
    const tableNames = Object.keys(tablePositions);
    if (tableNames.length === 0) return;

    // ── Bounding box (with extra room for lines routed outside table edges) ──
    const PADDING = 60, EXTRA = 100;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const name of tableNames) {
      const pos = tablePositions[name];
      const td  = tables.find((t) => t.name === name);
      if (!pos || !td) continue;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + TABLE_WIDTH);
      maxY = Math.max(maxY, pos.y + HEADER_HEIGHT + td.columns.length * COL_HEIGHT);
    }
    minX -= EXTRA; minY -= EXTRA; maxX += EXTRA; maxY += EXTRA;
    const W  = maxX - minX + PADDING * 2;
    const H  = maxY - minY + PADDING * 2;
    const ox = -minX + PADDING;
    const oy = -minY + PADDING;
    const SCALE = 2;

    // ── Canvas setup ─────────────────────────────────────────────────────────
    const cvs = document.createElement("canvas");
    cvs.width  = W * SCALE;
    cvs.height = H * SCALE;
    const ctx  = cvs.getContext("2d");
    ctx.scale(SCALE, SCALE);

    // ── Background + dot grid ────────────────────────────────────────────────
    ctx.fillStyle = isDark ? "#1e1e1e" : "#f5f5f5";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = isDark ? "#2a2a2b" : "#d8d8d8";
    for (let gx = 28; gx < W; gx += 28)
      for (let gy = 28; gy < H; gy += 28) {
        ctx.beginPath(); ctx.arc(gx, gy, 0.7, 0, Math.PI * 2); ctx.fill();
      }

    // ── Relationship lines (same phase 1/2/3 logic as RelationshipLines) ────
    const items = [];
    for (const ref of refs) {
      const fromPos  = tablePositions[ref.from.table];
      const toPos    = tablePositions[ref.to.table];
      const fromData = tables.find((t) => t.name === ref.from.table);
      const toData   = tables.find((t) => t.name === ref.to.table);
      if (!fromPos || !toPos || !fromData || !toData) continue;
      const fromColIdx = fromData.columns.findIndex((c) => c.name === ref.from.column);
      const toColIdx   = toData.columns.findIndex((c) => c.name === ref.to.column);
      if (fromColIdx === -1 || toColIdx === -1) continue;
      const fromRight = fromPos.x + TABLE_WIDTH;
      const toRight   = toPos.x  + TABLE_WIDTH;
      const xOverlap  = Math.max(0, Math.min(fromRight, toRight) - Math.max(fromPos.x, toPos.x));
      let crowDir;
      if (xOverlap / TABLE_WIDTH > 0.5)         crowDir = "vert-left";
      else if (fromPos.x >= toRight)             crowDir = "left";
      else if (toPos.x  >= fromRight)            crowDir = "right";
      else crowDir = (fromPos.x + TABLE_WIDTH / 2) <= (toPos.x + TABLE_WIDTH / 2) ? "right" : "left";
      items.push({ ref, fromColIdx, toColIdx, crowDir, fromPos, toPos, fromRight, toRight });
    }
    const fromGroups = {};
    items.forEach((item) => { const k = `${item.ref.from.table}::${item.crowDir}`; (fromGroups[k] ??= []).push(item); });
    Object.values(fromGroups).forEach((g) => { g.sort((a, b) => a.fromColIdx - b.fromColIdx); g.forEach((item, i) => { item.fromLane = i; item.fromLaneCount = g.length; }); });
    const toGroups = {};
    items.forEach((item) => { const k = `${item.ref.to.table}::${item.ref.to.column}`; (toGroups[k] ??= []).push(item); });
    Object.values(toGroups).forEach((g) => { g.sort((a, b) => a.ref.from.table.localeCompare(b.ref.from.table)); g.forEach((item, i) => { item.toLane = i; item.toLaneCount = g.length; }); });

    const lc = isDark ? "#5c6472" : "#b0bac8";
    ctx.lineCap = "round";
    for (const item of items) {
      const { fromColIdx, toColIdx, crowDir, fromPos, toPos, fromRight, toRight,
              fromLane, fromLaneCount, toLane, toLaneCount } = item;
      const fromY = getColumnY(fromPos, fromColIdx);
      const toY   = getColumnY(toPos,   toColIdx);
      const x1 = crowDir === "right" ? fromRight + 1 : fromPos.x - 1;
      const x2 = (crowDir === "right" || crowDir === "vert-left") ? toPos.x - 1 : toRight + 1;
      const pathX1  = crowDir === "right" ? x1 + 10 : x1 - 10;
      const pathX2  = (crowDir === "right" || crowDir === "vert-left") ? x2 - 6  : x2 + 6;
      const circleX = (crowDir === "right" || crowDir === "vert-left") ? x2 - 10 : x2 + 10;
      const laneOffset = fromLaneCount > 1 ? (fromLane - (fromLaneCount - 1) / 2) * LANE_SPACING : 0;
      let midX;
      if (crowDir === "vert-left") {
        midX = Math.min(fromPos.x, toPos.x) - 30 - Math.abs(laneOffset);
      } else {
        midX = (pathX1 + pathX2) / 2 + (crowDir === "right" ? laneOffset : -laneOffset);
      }
      const arriveOffset = toLaneCount > 1 ? (toLane - (toLaneCount - 1) / 2) * ARRIVE_SPREAD : 0;
      const toYAdj = toY + arriveOffset;

      // Path
      ctx.beginPath();
      ctx.moveTo(pathX1 + ox, fromY + oy);
      ctx.lineTo(midX  + ox, fromY + oy);
      ctx.lineTo(midX  + ox, toYAdj + oy);
      ctx.lineTo(pathX2 + ox, toYAdj + oy);
      ctx.strokeStyle = lc; ctx.lineWidth = 1.3; ctx.stroke();

      // Crow's foot
      const spread = 6, depth = 10;
      const cfDir = crowDir === "right" ? "right" : "left";
      const px = cfDir === "right" ? x1 + ox + depth : x1 + ox - depth;
      [[x1 + ox, fromY + oy - spread, x1 + ox, fromY + oy + spread],
       [x1 + ox, fromY + oy, px, fromY + oy - spread],
       [x1 + ox, fromY + oy, px, fromY + oy + spread]].forEach(([x1c, y1c, x2c, y2c]) => {
        ctx.beginPath(); ctx.moveTo(x1c, y1c); ctx.lineTo(x2c, y2c);
        ctx.strokeStyle = lc; ctx.lineWidth = 1.3; ctx.stroke();
      });

      // Circle
      ctx.beginPath(); ctx.arc(circleX + ox, toYAdj + oy, 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = lc; ctx.lineWidth = 1.3; ctx.stroke();

      // Labels
      ctx.fillStyle = lc; ctx.textBaseline = "alphabetic";
      ctx.font = "bold 11px 'DM Sans', sans-serif";
      ctx.textAlign = crowDir === "right" ? "left" : "right";
      ctx.fillText("*", (crowDir === "right" ? x1 + 13 : x1 - 13) + ox, fromY + oy - 9);
      ctx.font = "400 9.5px 'DM Sans', sans-serif";
      ctx.textAlign = (crowDir === "right" || crowDir === "vert-left") ? "right" : "left";
      ctx.globalAlpha = 0.85;
      ctx.fillText("0..1", ((crowDir === "right" || crowDir === "vert-left") ? x2 - 13 : x2 + 13) + ox, toYAdj + oy - 9);
      ctx.globalAlpha = 1;
    }

    // ── Table cards ──────────────────────────────────────────────────────────
    await document.fonts.ready;
    for (const table of tables) {
      const pos = tablePositions[table.name];
      if (!pos) continue;
      const color  = tableColors[table.name] || "#10b981";
      const tx     = pos.x + ox;
      const ty     = pos.y + oy;
      const tableH = HEADER_HEIGHT + table.columns.length * COL_HEIGHT;

      // Shadow + body
      ctx.shadowColor = "rgba(0,0,0,0.09)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      canvasRoundRect(ctx, tx, ty, TABLE_WIDTH, tableH, 6);
      ctx.fillStyle = isDark ? "#252526" : "#ffffff"; ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Border
      canvasRoundRect(ctx, tx, ty, TABLE_WIDTH, tableH, 6);
      ctx.strokeStyle = isDark ? "#3e3e42" : "#d8d8d8"; ctx.lineWidth = 1; ctx.stroke();

      // Header (clip to top rounded corners)
      ctx.save();
      canvasRoundRect(ctx, tx, ty, TABLE_WIDTH, HEADER_HEIGHT, 6); ctx.clip();
      ctx.fillStyle = color; ctx.fillRect(tx, ty, TABLE_WIDTH, HEADER_HEIGHT);
      ctx.restore();

      // Table name
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 13px 'DM Sans', sans-serif";
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.fillText(table.name, tx + 12, ty + HEADER_HEIGHT / 2);

      // Columns
      for (let i = 0; i < table.columns.length; i++) {
        const col = table.columns[i];
        const cy  = ty + HEADER_HEIGHT + i * COL_HEIGHT;
        if (i < table.columns.length - 1) {
          ctx.strokeStyle = isDark ? "#3e3e42" : "#eeeeee"; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(tx + 1, cy + COL_HEIGHT); ctx.lineTo(tx + TABLE_WIDTH - 1, cy + COL_HEIGHT); ctx.stroke();
        }
        const isFk = fkMap[table.name]?.has(col.name);
        const nameX = tx + 12 + (col.isPk || isFk ? 16 : 0);
        ctx.fillStyle = isDark ? "#d1d5db" : "#3b3b3b";
        ctx.font = `${col.isPk ? "600" : "400"} 12.5px 'DM Sans', sans-serif`;
        ctx.textBaseline = "middle"; ctx.textAlign = "left";
        ctx.fillText(col.name, nameX, cy + COL_HEIGHT / 2);
        ctx.fillStyle = isDark ? "#6b7280" : "#8a92a0";
        ctx.font = "400 11px 'JetBrains Mono', monospace";
        ctx.textAlign = "right";
        ctx.fillText(col.type, tx + TABLE_WIDTH - 12, cy + COL_HEIGHT / 2);
      }
    }

    // ── Download ─────────────────────────────────────────────────────────────
    const link = document.createElement("a");
    link.download = "sketcher-diagram.png";
    link.href = cvs.toDataURL("image/png");
    link.click();
  }, [tablePositions, tables, tableColors, refs, fkMap, isDark]);

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
    if (e.target === canvasRef.current || e.target.tagName === "svg") {
      setIsPanning(true);
      setPanStart({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y });
      setSelectedTable(null);
    }
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

  const handleColorChange = (tableName, color) => {
    setTableColors((prev) => ({ ...prev, [tableName]: color }));
  };

  const [lineNumbers, setLineNumbers] = useState([]);
  useEffect(() => {
    setLineNumbers(dbml.split("\n").map((_, i) => i + 1));
  }, [dbml]);

  const editorRef = useRef(null);
  const lineNumRef = useRef(null);
  const handleEditorScroll = () => {
    if (editorRef.current && lineNumRef.current) {
      lineNumRef.current.scrollTop = editorRef.current.scrollTop;
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
        </div>

        {/* Color palette (when table selected) */}
        {selectedTable && (
          <div
            style={{
              padding: "10px 18px",
              borderBottom: `1px solid ${theme.border}`,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: theme.colorPaletteRowBg,
              fontSize: "11px",
            }}
          >
            <span style={{ color: theme.textSecondary, marginRight: "4px", fontWeight: 500 }}>
              {selectedTable}:
            </span>
            {TABLE_COLORS.map((c) => (
              <div
                key={c}
                onClick={() => handleColorChange(selectedTable, c)}
                style={{
                  width: 19,
                  height: 19,
                  borderRadius: "50%",
                  background: c,
                  cursor: "pointer",
                  border: tableColors[selectedTable] === c
                    ? `2.5px solid ${isDark ? "#fff" : "#1e1e1e"}`
                    : "2.5px solid transparent",
                  transition: "all 0.15s",
                  flexShrink: 0,
                }}
              />
            ))}
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
          <textarea
            ref={editorRef}
            value={dbml}
            onChange={(e) => setDbml(e.target.value)}
            onScroll={handleEditorScroll}
            spellCheck={false}
            style={{
              flex: 1,
              background: theme.editorPanelBg,
              color: theme.editorText,
              border: "none",
              outline: "none",
              resize: "none",
              padding: "14px",
              fontSize: "12.5px",
              lineHeight: "20px",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              tabSize: 2,
              letterSpacing: "0.3px",
            }}
          />
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
          cursor: isPanning ? "grabbing" : "default",
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

        <Toolbar
          onAutoLayout={autoLayout}
          onResetView={resetView}
          onZoomIn={() => setZoom((z) => Math.min(2, z + 0.15))}
          onZoomOut={() => setZoom((z) => Math.max(0.25, z - 0.15))}
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
                isSelected={selectedTable === table.name}
                onSelect={setSelectedTable}
                theme={theme}
                fkColumns={fkMap[table.name]}
                activeColumns={activeColumns[table.name]}
                onHover={setHoveredTable}
                width={tableWidths[table.name]}
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
