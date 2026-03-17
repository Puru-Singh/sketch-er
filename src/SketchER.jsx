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
}`;

const TABLE_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#ef4444",
  "#f59e0b", "#ec4899", "#06b6d4", "#f97316",
  "#6366f1", "#14b8a6", "#e11d48", "#84cc16",
];

const LIGHT_THEME = {
  appBg: "#ffffff",
  editorPanelBg: "#f3f3f3",
  editorHeaderBg: "linear-gradient(180deg, #ebebeb 0%, #f3f3f3 100%)",
  border: "#e4e4e4",
  textPrimary: "#1e1e1e",
  textSecondary: "#6e6e6e",
  textMuted: "#a0a0a0",
  textFaint: "#bbbbbb",
  editorText: "#1e1e1e",
  editorBg: "#f3f3f3",
  lineNumberColor: "#c0c0c0",
  lineNumberBorder: "#e4e4e4",
  tableBg: "#ffffff",
  tableBorder: "#d8d8d8",
  colRowAlt: "rgba(0,0,0,0.025)",
  colDivider: "#eeeeee",
  colText: "#3b3b3b",
  colType: "#6e6e6e",
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
};

const DARK_THEME = {
  appBg: "#1e1e1e",
  editorPanelBg: "#252526",
  editorHeaderBg: "linear-gradient(180deg, #2a2a2b 0%, #252526 100%)",
  border: "#3e3e42",
  textPrimary: "#d4d4d4",
  textSecondary: "#9d9d9d",
  textMuted: "#6e6e6e",
  textFaint: "#444444",
  editorText: "#d4d4d4",
  editorBg: "#252526",
  lineNumberColor: "#555555",
  lineNumberBorder: "#3e3e42",
  tableBg: "#252526",
  tableBorder: "#3e3e42",
  colRowAlt: "rgba(255,255,255,0.03)",
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
  return { tables, refs };
}

const COL_HEIGHT = 32;
const HEADER_HEIGHT = 42;
const TABLE_WIDTH = 230;

function getColumnY(table, colIndex) {
  return table.y + HEADER_HEIGHT + colIndex * COL_HEIGHT + COL_HEIGHT / 2;
}

function generatePath(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
}

function RelationshipLines({ refs, tablePositions, tableData }) {
  const lines = [];
  for (const ref of refs) {
    const fromTable = tablePositions[ref.from.table];
    const toTable = tablePositions[ref.to.table];
    const fromData = tableData.find((t) => t.name === ref.from.table);
    const toData = tableData.find((t) => t.name === ref.to.table);
    if (!fromTable || !toTable || !fromData || !toData) continue;
    const fromColIdx = fromData.columns.findIndex((c) => c.name === ref.from.column);
    const toColIdx = toData.columns.findIndex((c) => c.name === ref.to.column);
    if (fromColIdx === -1 || toColIdx === -1) continue;

    const fromY = getColumnY(fromTable, fromColIdx);
    const toY = getColumnY(toTable, toColIdx);
    const fromCenterX = fromTable.x + TABLE_WIDTH / 2;
    const toCenterX = toTable.x + TABLE_WIDTH / 2;
    const fromRight = fromTable.x + TABLE_WIDTH;
    const toRight = toTable.x + TABLE_WIDTH;

    let x1, x2;
    if (fromCenterX < toCenterX) {
      x1 = fromRight + 2;
      x2 = toTable.x - 2;
    } else {
      x1 = fromTable.x - 2;
      x2 = toRight + 2;
    }

    const path = generatePath(x1, fromY, x2, toY);
    const key = `${ref.from.table}.${ref.from.column}-${ref.to.table}.${ref.to.column}`;
    lines.push(
      <g key={key}>
        <path d={path} fill="none" stroke="#10b981" strokeWidth="2" opacity="0.3" />
        <path d={path} fill="none" stroke="#10b981" strokeWidth="1.2" opacity="0.65" />
        <circle cx={x2} cy={toY} r="4.5" fill="#10b981" opacity="0.55" />
        <circle cx={x1} cy={fromY} r="3.5" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.55" />
      </g>
    );
  }
  return <>{lines}</>;
}

function TableNode({ table, position, color, onDragStart, onColorChange, isSelected, onSelect, theme }) {
  const handleMouseDown = (e) => {
    if (e.target.closest(".color-picker-area")) return;
    e.stopPropagation();
    onSelect(table.name);
    onDragStart(table.name, e.clientX, e.clientY);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: TABLE_WIDTH,
        borderRadius: "8px",
        overflow: "hidden",
        boxShadow: isSelected
          ? `0 0 0 2px ${color}, 0 8px 24px rgba(0,0,0,0.15)`
          : `0 2px 10px rgba(0,0,0,0.1), 0 0 0 1px ${theme.tableBorder}`,
        cursor: "grab",
        userSelect: "none",
        transition: "box-shadow 0.15s ease",
        background: theme.tableBg,
        border: `1px solid ${isSelected ? color : theme.tableBorder}`,
      }}
    >
      <div
        style={{
          height: HEADER_HEIGHT,
          background: `linear-gradient(135deg, ${color}, ${color}dd)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          fontWeight: 700,
          fontSize: "13px",
          color: "#fff",
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
          {table.name}
        </span>
        <div className="color-picker-area">
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(table.name, e.target.value)}
            style={{
              width: "22px",
              height: "22px",
              border: "2px solid rgba(255,255,255,0.35)",
              borderRadius: "50%",
              cursor: "pointer",
              padding: 0,
              background: "transparent",
              appearance: "none",
              WebkitAppearance: "none",
            }}
            title="Change header color"
          />
        </div>
      </div>
      <div>
        {table.columns.map((col, i) => (
          <div
            key={col.name}
            style={{
              height: COL_HEIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 14px",
              fontSize: "12px",
              borderBottom: i < table.columns.length - 1 ? `1px solid ${theme.colDivider}` : "none",
              background: i % 2 === 0 ? "transparent" : theme.colRowAlt,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "7px", color: theme.colText }}>
              {col.isPk && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              )}
              <span style={{ fontWeight: col.isPk ? 600 : 400 }}>{col.name}</span>
            </span>
            <span
              style={{
                color: theme.colType,
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontWeight: 500,
              }}
            >
              {col.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toolbar({ onAutoLayout, onZoomIn, onZoomOut, zoom, onResetView, isDark, onToggleTheme, theme }) {
  const btnStyle = {
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
  };
  return (
    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: "6px", zIndex: 20 }}>
      <button style={btnStyle} onClick={onToggleTheme} title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
        {isDark ? (
          // Sun icon
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          // Moon icon
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
      <button style={btnStyle} onClick={onZoomOut} title="Zoom out">−</button>
      <span style={{ ...btnStyle, cursor: "default", minWidth: "50px", justifyContent: "center", fontSize: "11px" }}>
        {Math.round(zoom * 100)}%
      </span>
      <button style={btnStyle} onClick={onZoomIn} title="Zoom in">+</button>
      <button style={btnStyle} onClick={onResetView} title="Reset view">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 12a9 9 0 1 1 3 6.7" /><path d="M3 21v-6h6" />
        </svg>
      </button>
      <button style={btnStyle} onClick={onAutoLayout}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        Layout
      </button>
    </div>
  );
}

function MiniMap({ tablePositions, tableData, colors, canvasOffset, zoom, canvasWidth, canvasHeight, theme }) {
  const MINIMAP_W = 160;
  const MINIMAP_H = 100;
  if (Object.keys(tablePositions).length === 0) return null;

  const allX = Object.values(tablePositions).map((p) => p.x);
  const allY = Object.values(tablePositions).map((p) => p.y);
  const minX = Math.min(...allX) - 50;
  const minY = Math.min(...allY) - 50;
  const maxX = Math.max(...allX) + TABLE_WIDTH + 50;
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
            width={TABLE_WIDTH * scale}
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

export default function SketchER() {
  const [isDark, setIsDark] = useState(false);
  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  const [dbml, setDbml] = useState(DEFAULT_DBML);
  const [tablePositions, setTablePositions] = useState({});
  const [tableColors, setTableColors] = useState({});
  const [selectedTable, setSelectedTable] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [editorWidth, setEditorWidth] = useState(370);
  const [isResizing, setIsResizing] = useState(false);
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  const { tables, refs } = useMemo(() => parseDBML(dbml), [dbml]);

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

  const handleMouseMove = useCallback((e) => {
    if (dragging) {
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
  }, [dragging, isPanning, panStart, zoom, canvasOffset, isResizing]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
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
          Ctrl+Scroll to zoom · Drag canvas to pan · Click table to color
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
            <RelationshipLines refs={refs} tablePositions={tablePositions} tableData={tables} />
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
      </div>
    </div>
  );
}
