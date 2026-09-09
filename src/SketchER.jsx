// Copyright (c) 2025 Puru Singh — https://github.com/Puru-Singh
// Licensed under the MIT License — see LICENSE for details.

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import MonacoEditor from "@monaco-editor/react";

import {
  dbmlLanguageConfig,
  dbmlMonarchTokensProvider,
  EMPTY_DBML_MODEL,
  parseDBMLDocument,
} from "./dbmlParser.js";

import {
  buildHierarchicalLayout,
  buildSmartLayout,
  HIERARCHY_LEAVES_LEFT,
  HIERARCHY_ROOTS_LEFT,
} from "./autoLayout.js";

import {
  longestVerticalSegment,
  orderSharedColumnArrivals,
  orthogonalPointsToPath,
  routeOrthogonalConnection,
} from "./relationshipRouting.js";

import { detectTableRenames } from "./tableIdentity.js";

import {
  calculateExportBounds,
  downloadPng,
  placeRightSideExportNode,
  renderDiagramPng,
} from "./diagramExport.js";

import { copyTextToClipboard } from "./clipboard.js";
import { buildShareUrl, decodeShareHash } from "./shareLink.js";

import {
  generateShareQrDataUrl,
  SHARE_QR_TOO_LARGE,
} from "./shareQr.js";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "sketcher-state";
const DOCUMENT_VERSION = 2;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DBML_LENGTH = 5 * 1024 * 1024;
const MAX_DICTIONARY_ENTRIES = 100_000;
const MAX_COORDINATE = 10_000_000;

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2;

const HEADER_HEIGHT = 42;
const COL_HEIGHT = 32;
const TABLE_META_HEIGHT = 24;
const TABLE_BORDER = 1;
const TABLE_MIN_WIDTH = 200;
const TABLE_WIDTH = 230;

const GROUP_PAD = 22;
const GROUP_LABEL_HEIGHT = 26;

const LANE_SPACING = 24;
const ARRIVAL_SPACING = 8;
const ROUTING_CLEARANCE = 12;

const TABLE_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#c026d3",
  "#ec4899",
  "#f43f5e",
];

const GROUP_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

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

const LIGHT_THEME = {
  appBg: "#ffffff",
  editorBg: "#f3f3f3",
  panelBg: "#ffffff",
  panelSoft: "#ebebeb",
  border: "#d4d4d4",
  text: "#1e1e1e",
  secondary: "#595959",
  muted: "#727272",
  tableBg: "#ffffff",
  tableBorder: "#d8d8d8",
  divider: "#eeeeee",
  columnText: "#3b3b3b",
  columnType: "#626b78",
  canvasBg:
    "radial-gradient(ellipse at 50% 40%, #f5f5f5 0%, #ebebeb 100%)",
  dot: "#cccccc",
  line: "#8995a5",
  activeColumn: "rgba(59,130,246,0.09)",
  legendBg: "rgba(255,255,255,0.7)",
};

const DARK_THEME = {
  appBg: "#1e1e1e",
  editorBg: "#252526",
  panelBg: "#2d2d2d",
  panelSoft: "#252526",
  border: "#505056",
  text: "#eeeeee",
  secondary: "#b6b6bc",
  muted: "#a0a0aa",
  tableBg: "#252526",
  tableBorder: "#505056",
  divider: "#3e3e42",
  columnText: "#d1d5db",
  columnType: "#a1a9b5",
  canvasBg:
    "radial-gradient(ellipse at 50% 40%, #252526 0%, #1e1e1e 100%)",
  dot: "#414148",
  line: "#8994a5",
  activeColumn: "rgba(59,130,246,0.2)",
  legendBg: "rgba(30,30,30,0.7)",
};

/* -------------------------------------------------------------------------- */
/* General utilities                                                          */
/* -------------------------------------------------------------------------- */

function dictionary(source) {
  return Object.assign(Object.create(null), source || {});
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampZoom(value) {
  return clamp(value, MIN_ZOOM, MAX_ZOOM);
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeColor(value) {
  if (typeof value !== "string") return null;

  const color = value.trim().toLowerCase();

  if (/^#[0-9a-f]{6}$/.test(color)) return color;

  if (/^#[0-9a-f]{3}$/.test(color)) {
    return `#${[...color.slice(1)].map((character) => character.repeat(2)).join("")}`;
  }

  return null;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function stableHash(value) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function nextGroupName(groups) {
  const names = new Set(groups.map((group) => group.name));

  if (!names.has("NewGroup")) return "NewGroup";

  let suffix = 2;
  while (names.has(`NewGroup${suffix}`)) suffix += 1;

  return `NewGroup${suffix}`;
}

function formatDbmlIdentifier(identifier) {
  if (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(identifier)) return identifier;

  return `"${identifier.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Prefer the original table declaration over splitting table.name on ".".
 * A dot inside a quoted identifier is not a schema separator.
 */
function getTableDbmlPath(table, dbml) {
  const lines = dbml.split("\n");
  const sourceLine = Number.isInteger(table.sourceStartLine)
    ? lines[table.sourceStartLine - 1]
    : null;

  const identifier = String.raw`(?:"(?:\\.|[^"\\])*"|[A-Za-z_][A-Za-z0-9_$]*)`;
  const declaration = new RegExp(
    String.raw`^\s*Table\s+(${identifier}(?:\s*\.\s*${identifier})*)`,
    "i",
  );

  const match = sourceLine?.match(declaration);
  if (match) return match[1];

  if (Array.isArray(table.nameParts) && table.nameParts.length) {
    return table.nameParts.map(formatDbmlIdentifier).join(".");
  }

  // Compatibility fallback for parser models without source information.
  return table.name.split(".").map(formatDbmlIdentifier).join(".");
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  let hue = 0;
  let saturation = 0;

  if (max !== min) {
    const delta = max - min;

    saturation =
      lightness > 0.5
        ? delta / (2 - max - min)
        : delta / (max + min);

    if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;

    hue /= 6;
  }

  return [hue * 360, saturation * 100, lightness * 100];
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const amplitude = s * Math.min(l, 1 - l);

  const component = (n) => {
    const k = (n + hue / 30) % 12;
    const value =
      l -
      amplitude * Math.max(Math.min(k - 3, 9 - k, 1), -1);

    return Math.round(255 * value).toString(16).padStart(2, "0");
  };

  return `#${component(0)}${component(8)}${component(4)}`;
}

function generateHueFamily(baseColor, count) {
  if (count <= 0) return [];
  if (count === 1) return [baseColor];

  const [h, s, l] = hexToHsl(baseColor);

  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1) - 0.5;

    return hslToHex(
      (h + t * 20 + 360) % 360,
      clamp(s + t * 10, 55, 92),
      clamp(l + t * 24, 32, 68),
    );
  });
}

function hasTableMeta(table) {
  return Boolean(
    table.note ||
      table.indexes?.length ||
      table.checks?.length ||
      table.records?.length,
  );
}

/**
 * Widths are outer border-box widths.
 * Heights include the outer border; row/header constants are border-box heights.
 */
function getTableHeight(table) {
  return (
    TABLE_BORDER * 2 +
    HEADER_HEIGHT +
    table.columns.length * COL_HEIGHT +
    (hasTableMeta(table) ? TABLE_META_HEIGHT : 0)
  );
}

function getColumnY(position, index) {
  return (
    position.y +
    TABLE_BORDER +
    HEADER_HEIGHT +
    index * COL_HEIGHT +
    COL_HEIGHT / 2
  );
}

function unionBounds(rectangles, padding = 0) {
  const valid = rectangles.filter(
    (rectangle) =>
      rectangle &&
      [rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(
        Number.isFinite,
      ) &&
      rectangle.width >= 0 &&
      rectangle.height >= 0,
  );

  if (!valid.length) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const rectangle of valid) {
    left = Math.min(left, rectangle.x);
    top = Math.min(top, rectangle.y);
    right = Math.max(right, rectangle.x + rectangle.width);
    bottom = Math.max(bottom, rectangle.y + rectangle.height);
  }

  return {
    x: left - padding,
    y: top - padding,
    width: Math.max(1, right - left + padding * 2),
    height: Math.max(1, bottom - top + padding * 2),
  };
}

function getGroupBounds(group, positions, tablesByName, widths) {
  const rectangles = [];

  for (const name of group.tables) {
    const position = positions[name];
    const table = tablesByName.get(name);

    if (!position || !table) continue;

    rectangles.push({
      x: position.x,
      y: position.y,
      width: widths[name] || TABLE_WIDTH,
      height: getTableHeight(table),
    });
  }

  const bounds = unionBounds(rectangles);
  if (!bounds) return null;

  return {
    x: bounds.x - GROUP_PAD,
    y: bounds.y - GROUP_PAD - GROUP_LABEL_HEIGHT,
    width: bounds.width + GROUP_PAD * 2,
    height: bounds.height + GROUP_PAD * 2 + GROUP_LABEL_HEIGHT,
  };
}

/* -------------------------------------------------------------------------- */
/* Validation and serialization                                               */
/* -------------------------------------------------------------------------- */

function readString(value, name, fallback, maxLength = MAX_DBML_LENGTH) {
  if (value === undefined) return fallback;

  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error(`${name} must be a string of at most ${maxLength} characters.`);
  }

  return value;
}

function readBoolean(value, name, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

function readRecord(value, name, validateValue) {
  if (value === undefined) return dictionary();

  if (!isRecord(value)) throw new Error(`${name} must be an object.`);

  const entries = Object.entries(value);

  if (entries.length > MAX_DICTIONARY_ENTRIES) {
    throw new Error(`${name} contains too many entries.`);
  }

  const result = dictionary();

  for (const [key, item] of entries) {
    if (key.length > 10_000) throw new Error(`${name} contains an oversized key.`);
    result[key] = validateValue(item, `${name}.${key}`);
  }

  return result;
}

function readCoordinate(value, name) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE) {
    throw new Error(`${name} must be a finite coordinate.`);
  }

  return value;
}

function readPosition(value, name) {
  if (!isRecord(value)) throw new Error(`${name} must contain x and y.`);

  return {
    x: readCoordinate(value.x, `${name}.x`),
    y: readCoordinate(value.y, `${name}.y`),
  };
}

function readColor(value, name) {
  const color = normalizeColor(value);
  if (!color) throw new Error(`${name} must be a hexadecimal color.`);
  return color;
}

function readStringArray(value, name, fallback = []) {
  if (value === undefined) return fallback;

  if (
    !Array.isArray(value) ||
    value.length > MAX_DICTIONARY_ENTRIES ||
    value.some((entry) => typeof entry !== "string" || entry.length > 10_000)
  ) {
    throw new Error(`${name} must be an array of strings.`);
  }

  return [...new Set(value)];
}

function normalizeDocument(raw, { requireDbml = false } = {}) {
  if (!isRecord(raw)) throw new Error("The diagram must be a JSON object.");

  if (
    raw.version !== undefined &&
    (!Number.isInteger(raw.version) ||
      raw.version < 1 ||
      raw.version > DOCUMENT_VERSION)
  ) {
    throw new Error("This diagram uses an unsupported file version.");
  }

  if (requireDbml && typeof raw.dbml !== "string") {
    throw new Error("The diagram does not contain a DBML document.");
  }

  let viewport = null;

  if (raw.viewport !== undefined && raw.viewport !== null) {
    if (!isRecord(raw.viewport)) {
      throw new Error("viewport must be an object.");
    }

    if (!Number.isFinite(raw.viewport.zoom)) {
      throw new Error("viewport.zoom must be a finite number.");
    }

    viewport = {
      zoom: clampZoom(raw.viewport.zoom),
      offset: readPosition(raw.viewport.offset, "viewport.offset"),
    };
  }

  const recentColors =
    raw.recentColors === undefined
      ? []
      : readStringArray(raw.recentColors, "recentColors")
          .map((color) => readColor(color, "recentColors"))
          .slice(0, 12);

  const editorWidth =
    raw.editorWidth === undefined
      ? 470
      : readCoordinate(raw.editorWidth, "editorWidth");

  return {
    version: DOCUMENT_VERSION,
    dbml: readString(raw.dbml, "dbml", DEFAULT_DBML),
    fileName: readString(raw.fileName, "fileName", "Untitled", 500),
    tablePositions: readRecord(raw.tablePositions, "tablePositions", readPosition),
    tableColors: readRecord(raw.tableColors, "tableColors", readColor),
    groupColors: readRecord(raw.groupColors, "groupColors", readColor),
    tableIds: readRecord(raw.tableIds, "tableIds", (value, name) =>
      readString(value, name, "", 200),
    ),
    lineMidXOverrides: readRecord(
      raw.lineMidXOverrides,
      "lineMidXOverrides",
      readCoordinate,
    ),
    colorLegendDescriptions: readRecord(
      raw.colorLegendDescriptions,
      "colorLegendDescriptions",
      (value, name) => readString(value, name, "", 20_000),
    ),
    recentColors: [...new Set(recentColors)],
    collapsedTables: readStringArray(raw.collapsedTables, "collapsedTables"),
    isDark: readBoolean(raw.isDark, "isDark", false),
    groupsVisible: readBoolean(raw.groupsVisible, "groupsVisible", false),
    colorLegendVisible: readBoolean(
      raw.colorLegendVisible,
      "colorLegendVisible",
      false,
    ),
    showAllConnections: readBoolean(
      raw.showAllConnections,
      "showAllConnections",
      false,
    ),
    jumpToTableOnClick: readBoolean(
      raw.jumpToTableOnClick,
      "jumpToTableOnClick",
      false,
    ),
    reverseConnectionFlow: readBoolean(
      raw.reverseConnectionFlow,
      "reverseConnectionFlow",
      false,
    ),
    isEditorCollapsed: readBoolean(
      raw.isEditorCollapsed,
      "isEditorCollapsed",
      false,
    ),
    editorWidth: clamp(editorWidth, 280, 700),
    viewport,
  };
}

function parseDocument(dbml) {
  try {
    const result = parseDBMLDocument(dbml);

    return {
      model: result.model || null,
      errors: result.errors || [],
      warnings: result.warnings || [],
    };
  } catch (error) {
    return {
      model: null,
      errors: [
        {
          message: errorMessage(error, "Unable to parse DBML."),
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 2,
        },
      ],
      warnings: [],
    };
  }
}

function modelTables(model) {
  return model?.tables || [];
}

function modelGroups(model) {
  return model?.groups || [];
}

function legacyRelationshipKey(ref) {
  const base =
    `rline-${ref.from.table}-${ref.from.column}` +
    `-${ref.to.table}-${ref.to.column}`;

  return ref.composite ? `${base}-${ref.id}` : base;
}

/**
 * Persistent route keys use stable table IDs, not DOM IDs or raw table names.
 * An ordinal distinguishes otherwise-identical repeated references.
 */
function identifyRelationships(model, tableIds) {
  const occurrences = new Map();

  return (model?.refs || []).map((ref) => {
    const signature = JSON.stringify([
      tableIds[ref.from.table] || ref.from.table,
      ref.from.columns || [ref.from.column],
      tableIds[ref.to.table] || ref.to.table,
      ref.to.columns || [ref.to.column],
      ref.name || "",
      ref.composite ? ref.from.column : "",
      ref.composite ? ref.to.column : "",
    ]);

    const ordinal = occurrences.get(signature) || 0;
    occurrences.set(signature, ordinal + 1);

    return {
      ...ref,
      routeKey: `v2:${signature}:${ordinal}`,
    };
  });
}

function reconcileDocument(data, model, previousModel, allowRenames) {
  const tables = modelTables(model);
  const validNames = new Set(tables.map((table) => table.name));
  const renames = allowRenames
    ? detectTableRenames(modelTables(previousModel), tables)
    : new Map();

  const positions = dictionary();
  const colors = dictionary();
  const tableIds = dictionary();

  const reverseRenames = new Map(
    [...renames].map(([oldName, newName]) => [newName, oldName]),
  );

  const reservedIds = new Set(
    Object.values(data.tableIds).filter((id) => typeof id === "string" && id),
  );
  const usedIds = new Set();
  let nextId = 1;

  function allocateId() {
    while (reservedIds.has(`t${nextId}`) || usedIds.has(`t${nextId}`)) {
      nextId += 1;
    }

    const id = `t${nextId}`;
    nextId += 1;
    return id;
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(tables.length)));

  tables.forEach((table, index) => {
    const oldName = reverseRenames.get(table.name);
    const sourceName = oldName || table.name;

    positions[table.name] =
      data.tablePositions[table.name] ||
      data.tablePositions[sourceName] || {
        x: 60 + (index % columns) * (TABLE_WIDTH + 90),
        y: 60 + Math.floor(index / columns) * 320,
      };

    const override =
      data.tableColors[table.name] || data.tableColors[sourceName];

    if (override) colors[table.name] = override;

    let id = data.tableIds[sourceName] || data.tableIds[table.name];

    if (!id || usedIds.has(id)) id = allocateId();

    usedIds.add(id);
    tableIds[table.name] = id;
  });

  const collapsedTables = [
    ...new Set(
      data.collapsedTables
        .map((name) => renames.get(name) || name)
        .filter((name) => validNames.has(name)),
    ),
  ];

  const groupColors = dictionary();
  const validGroups = new Set(modelGroups(model).map((group) => group.name));

  for (const [name, color] of Object.entries(data.groupColors)) {
    if (validGroups.has(name)) groupColors[name] = color;
  }

  const identifiedRefs = identifyRelationships(model, tableIds);
  const overrides = dictionary();

  for (const ref of identifiedRefs) {
    if (hasOwn(data.lineMidXOverrides, ref.routeKey)) {
      overrides[ref.routeKey] = data.lineMidXOverrides[ref.routeKey];
      continue;
    }

    const oldKey = legacyRelationshipKey(ref);

    if (hasOwn(data.lineMidXOverrides, oldKey)) {
      overrides[ref.routeKey] = data.lineMidXOverrides[oldKey];
    }
  }

  return {
    data: {
      ...data,
      tablePositions: positions,
      tableColors: colors,
      tableIds,
      groupColors,
      collapsedTables,
      lineMidXOverrides: overrides,
    },
    renames,
    validNames,
    validGroups,
  };
}

function createDocumentState(data, parsed, epoch = 0) {
  const model = parsed.model || EMPTY_DBML_MODEL;

  const reconciled = parsed.model
    ? reconcileDocument(data, model, null, false).data
    : data;

  return {
    data: reconciled,
    model,
    parsedSource: data.dbml,
    errors: parsed.errors,
    warnings: parsed.warnings,
    epoch,
    geometryRevision: 0,
    selectedTables: [],
    selectedGroup: null,
    hoveredTable: null,
  };
}

function initializeApplication() {
  const warnings = [];
  let data = null;
  let fromShare = false;

  if (typeof window !== "undefined") {
    try {
      const shared = decodeShareHash(window.location.hash);

      if (shared) {
        data = normalizeDocument(shared, { requireDbml: true });
        fromShare = true;
      }
    } catch (error) {
      warnings.push(errorMessage(error, "The shared diagram could not be opened."));
    }

    if (!data) {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);

        if (stored) {
          if (stored.length > MAX_FILE_BYTES) {
            throw new Error("The saved diagram is too large.");
          }

          data = normalizeDocument(JSON.parse(stored), {
            requireDbml: true,
          });
        }
      } catch (error) {
        warnings.push(
          errorMessage(error, "The previously saved diagram could not be restored."),
        );
      }
    }
  }

  data ||= normalizeDocument({ dbml: DEFAULT_DBML });

  return {
    ...createDocumentState(data, parseDocument(data.dbml)),
    startupWarnings: warnings,
    fromShare,
  };
}

function documentReducer(state, action) {
  switch (action.type) {
    case "edit":
      return {
        ...state,
        data: { ...state.data, dbml: action.dbml },
        geometryRevision: state.geometryRevision + 1,
      };

    case "parsed": {
      if (
        action.epoch !== state.epoch ||
        action.source !== state.data.dbml
      ) {
        return state;
      }

      if (!action.result.model) {
        return {
          ...state,
          parsedSource: action.source,
          errors: action.result.errors,
          warnings: action.result.warnings,
        };
      }

      const result = reconcileDocument(
        state.data,
        action.result.model,
        state.model,
        true,
      );

      const rename = (name) => result.renames.get(name) || name;

      const selectedTables = [
        ...new Set(
          state.selectedTables
            .map(rename)
            .filter((name) => result.validNames.has(name)),
        ),
      ];

      const hover = state.hoveredTable ? rename(state.hoveredTable) : null;

      return {
        ...state,
        data: result.data,
        model: action.result.model,
        parsedSource: action.source,
        errors: action.result.errors,
        warnings: action.result.warnings,
        geometryRevision: state.geometryRevision + 1,
        selectedTables,
        selectedGroup: result.validGroups.has(state.selectedGroup)
          ? state.selectedGroup
          : null,
        hoveredTable: result.validNames.has(hover) ? hover : null,
      };
    }

    case "open":
      return {
        ...createDocumentState(action.data, action.parsed, state.epoch + 1),
        startupWarnings: [],
        fromShare: false,
      };

    case "patch":
      return {
        ...state,
        data: { ...state.data, ...action.patch },
        geometryRevision:
          state.geometryRevision + (action.geometry ? 1 : 0),
      };

    case "positions": {
      const positions = dictionary(state.data.tablePositions);

      for (const [name, position] of Object.entries(action.positions)) {
        if (!hasOwn(state.data.tablePositions, name)) continue;

        positions[name] = {
          x: clamp(position.x, -MAX_COORDINATE, MAX_COORDINATE),
          y: clamp(position.y, -MAX_COORDINATE, MAX_COORDINATE),
        };
      }

      const overrides = dictionary(state.data.lineMidXOverrides);

      if (action.lineOverrides) {
        for (const [key, x] of Object.entries(action.lineOverrides)) {
          overrides[key] = clamp(x, -MAX_COORDINATE, MAX_COORDINATE);
        }
      }

      return {
        ...state,
        data: {
          ...state.data,
          tablePositions: positions,
          lineMidXOverrides: overrides,
        },
        geometryRevision: state.geometryRevision + 1,
      };
    }

    case "layout":
      if (
        action.epoch !== state.epoch ||
        action.revision !== state.geometryRevision
      ) {
        return state;
      }

      return {
        ...state,
        data: {
          ...state.data,
          tablePositions: dictionary(action.positions),
          lineMidXOverrides: dictionary(),
        },
        geometryRevision: state.geometryRevision + 1,
      };

    case "line":
      return {
        ...state,
        data: {
          ...state.data,
          lineMidXOverrides: Object.assign(
            dictionary(state.data.lineMidXOverrides),
            {
              [action.key]: clamp(
                action.x,
                -MAX_COORDINATE,
                MAX_COORDINATE,
              ),
            },
          ),
        },
        geometryRevision: state.geometryRevision + 1,
      };

    case "select":
      return {
        ...state,
        selectedTables: action.names,
        selectedGroup: null,
      };

    case "select-group":
      return {
        ...state,
        selectedTables: [],
        selectedGroup: action.name,
      };

    case "hover":
      return state.hoveredTable === action.name
        ? state
        : { ...state, hoveredTable: action.name };

    case "collapse": {
      const collapsed = new Set(state.data.collapsedTables);

      if (collapsed.has(action.name)) collapsed.delete(action.name);
      else collapsed.add(action.name);

      return {
        ...state,
        data: { ...state.data, collapsedTables: [...collapsed] },
        geometryRevision: state.geometryRevision + 1,
      };
    }

    case "table-colors": {
      const colors = dictionary(state.data.tableColors);

      for (const [name, color] of Object.entries(action.colors)) {
        if (color === null) delete colors[name];
        else colors[name] = color;
      }

      return {
        ...state,
        data: { ...state.data, tableColors: colors },
      };
    }

    case "group-color":
      return {
        ...state,
        data: {
          ...state.data,
          groupColors: Object.assign(dictionary(state.data.groupColors), {
            [action.name]: action.color,
          }),
        },
      };

    case "recent-colors": {
      const recent = [
        ...new Set([...action.colors, ...state.data.recentColors]),
      ].slice(0, 12);

      if (arraysEqual(recent, state.data.recentColors)) return state;

      return {
        ...state,
        data: { ...state.data, recentColors: recent },
      };
    }

    case "legend-description": {
      const descriptions = dictionary(state.data.colorLegendDescriptions);

      if (action.description) descriptions[action.color] = action.description;
      else delete descriptions[action.color];

      return {
        ...state,
        data: { ...state.data, colorLegendDescriptions: descriptions },
      };
    }

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

function useLatest(value) {
  const ref = useRef(value);

  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);

    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () => {
      const bounds = element.getBoundingClientRect();

      setSize((previous) => {
        const next = { width: bounds.width, height: bounds.height };

        return previous.width === next.width && previous.height === next.height
          ? previous
          : next;
      });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function useAutosave(snapshot) {
  const latest = useLatest(snapshot);
  const dirtyRef = useRef(false);
  const debounceRef = useRef(null);
  const maxWaitRef = useRef(null);
  const [status, setStatus] = useState("saved");

  const flush = useCallback(() => {
    if (!dirtyRef.current) return;

    clearTimeout(debounceRef.current);
    clearTimeout(maxWaitRef.current);
    debounceRef.current = null;
    maxWaitRef.current = null;

    try {
      const serialized = JSON.stringify(latest.current);

      if (serialized.length > MAX_FILE_BYTES) {
        throw new Error("The diagram exceeds the autosave size limit.");
      }

      window.localStorage.setItem(STORAGE_KEY, serialized);
      dirtyRef.current = false;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [latest]);

  useEffect(() => {
    dirtyRef.current = true;
    setStatus("pending");

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, 400);

    if (!maxWaitRef.current) {
      maxWaitRef.current = setTimeout(flush, 2000);
    }

    return () => clearTimeout(debounceRef.current);
  }, [snapshot, flush]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
      clearTimeout(debounceRef.current);
      clearTimeout(maxWaitRef.current);
    };
  }, [flush]);

  return { status, flush };
}

function useTableWidths(tables, relationshipColumns) {
  const [fontRevision, setFontRevision] = useState(0);

  useEffect(() => {
    let active = true;

    const update = () => {
      if (active) setFontRevision((revision) => revision + 1);
    };

    document.fonts?.ready.then(update);
    document.fonts?.addEventListener?.("loadingdone", update);

    return () => {
      active = false;
      document.fonts?.removeEventListener?.("loadingdone", update);
    };
  }, []);

  return useMemo(() => {
    const result = dictionary();
    const canvas =
      typeof document !== "undefined" ? document.createElement("canvas") : null;
    const context = canvas?.getContext("2d");

    const measure = (text, font) => {
      const value = String(text || "");

      if (!context) return value.length * 7.5;

      context.font = font;
      return context.measureText(value).width;
    };

    for (const table of tables) {
      let width = Math.max(
        TABLE_MIN_WIDTH,
        measure(table.name, "700 12px 'DM Sans', sans-serif") + 78,
      );

      for (const column of table.columns) {
        const related = relationshipColumns.get(table.name)?.has(column.name);

        const nameFont =
          `${related && !column.isPk ? "italic " : ""}` +
          `${column.isPk ? "600" : "400"} 12.5px 'DM Sans', sans-serif`;

        const nameWidth = measure(column.name, nameFont);
        const typeWidth = measure(
          column.type,
          "400 11px 'JetBrains Mono', monospace",
        );

        const iconWidth = column.isPk || related ? 18 : 0;
        const badges =
          (column.isUnique && !column.isPk ? 22 : 0) +
          (column.increment ? 18 : 0) +
          (column.notNull && !column.isPk ? 22 : 0);

        width = Math.max(
          width,
          24 + iconWidth + nameWidth + 20 + typeWidth + badges,
        );
      }

      result[table.name] = Math.ceil(width + TABLE_BORDER * 2);
    }

    return result;
  }, [tables, relationshipColumns, fontRevision]);
}

/* -------------------------------------------------------------------------- */
/* Reusable UI                                                                */
/* -------------------------------------------------------------------------- */

function ToolButton({
  children,
  label,
  onClick,
  disabled = false,
  buttonRef,
  className = "",
  ...rest
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`sker-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <label className="sker-toggle-label">
      <input
        type="checkbox"
        className="sker-toggle-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="sker-toggle-track" aria-hidden="true">
        <span />
      </span>
      <span>{label}</span>
    </label>
  );
}

function Popover({
  label,
  children,
  trigger,
  triggerRef,
  disabled = false,
  align = "right",
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const localTriggerRef = useRef(null);
  const actualTriggerRef = triggerRef || localTriggerRef;

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);

    if (restoreFocus) {
      requestAnimationFrame(() => actualTriggerRef.current?.focus());
    }
  }, [actualTriggerRef]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointer = (event) => {
      if (!containerRef.current?.contains(event.target)) close();
    };

    const onFocus = (event) => {
      if (!containerRef.current?.contains(event.target)) close();
    };

    const onKey = (event) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      close(true);
    };

    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("focusin", onFocus);
    containerRef.current?.addEventListener("keydown", onKey);

    const container = containerRef.current;

    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("focusin", onFocus);
      container?.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div ref={containerRef} className="sker-popover-container">
      <ToolButton
        buttonRef={actualTriggerRef}
        label={label}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;

          event.preventDefault();
          setOpen(true);

          requestAnimationFrame(() => {
            containerRef.current
              ?.querySelector("[data-popover-panel] button, [data-popover-panel] input")
              ?.focus();
          });
        }}
      >
        {trigger} <span aria-hidden="true">▾</span>
      </ToolButton>

      {open && (
        <div
          id={id}
          data-popover-panel="1"
          data-canvas-wheel-ignore="1"
          role="region"
          aria-label={label}
          className={`sker-popover sker-popover-${align}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

function Dialog({ title, onClose, restoreFocusRef, children, wide = false }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useLatest(onClose);

  useLayoutEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = [
        ...(panelRef.current?.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), ' +
          'select:not([disabled]), textarea:not([disabled]), ' +
          '[tabindex]:not([tabindex="-1"])',
        ) || []),
      ].filter((element) => element.getClientRects().length > 0);

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);

      requestAnimationFrame(() => {
        const target =
          restoreFocusRef?.current ||
          (previousFocus?.isConnected ? previousFocus : null);

        target?.focus?.();
      });
    };
  }, [onCloseRef, restoreFocusRef]);

  return createPortal(
    <div
      className="sker-dialog-backdrop"
      data-canvas-wheel-ignore="1"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`sker-dialog ${wide ? "sker-dialog-wide" : ""}`}
      >
        <header className="sker-dialog-header">
          <h2 id={titleId}>{title}</h2>
          <ToolButton buttonRef={closeRef} label="Close dialog" onClick={onClose}>
            ×
          </ToolButton>
        </header>
        <div className="sker-dialog-content">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

function ColorPicker({ value, onChange, label = "Choose a custom color" }) {
  return (
    <label className="sker-color-picker" title={label}>
      <span aria-hidden="true">◉</span>
      <input
        type="color"
        value={normalizeColor(value) || "#10b981"}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ColorPalette({ colors, selected, onChoose, label }) {
  return (
    <div className="sker-color-row" role="group" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={`sker-color-dot ${selected === color ? "is-selected" : ""}`}
          style={{ background: color }}
          aria-label={`Apply color ${color}`}
          title={color}
          onClick={() => onChoose(color)}
        />
      ))}
    </div>
  );
}

function ZoomControl({ zoom, onChange }) {
  const [draft, setDraft] = useState(String(Math.round(zoom * 100)));

  useEffect(() => {
    setDraft(String(Math.round(zoom * 100)));
  }, [zoom]);

  const apply = () => {
    const parsed = Number(draft);

    if (!Number.isFinite(parsed) || !draft.trim()) {
      setDraft(String(Math.round(zoom * 100)));
      return;
    }

    onChange(clampZoom(parsed / 100));
  };

  return (
    <Popover label="Canvas zoom" trigger={`${Math.round(zoom * 100)}%`}>
      {(close) => (
        <div className="sker-stack">
          <label className="sker-stack">
            <span>Zoom</span>
            <input
              type="range"
              min={MIN_ZOOM * 100}
              max={MAX_ZOOM * 100}
              step={1}
              value={zoom * 100}
              onChange={(event) => onChange(Number(event.target.value) / 100)}
            />
          </label>

          <div className="sker-inline">
            <label className="sker-grow">
              <span className="sker-sr-only">Zoom percentage</span>
              <input
                type="number"
                min={MIN_ZOOM * 100}
                max={MAX_ZOOM * 100}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    apply();
                    close(true);
                  }
                }}
              />
            </label>
            <span>%</span>
            <ToolButton label="Apply zoom" onClick={apply}>
              Apply
            </ToolButton>
          </div>

          <div className="sker-inline">
            {[50, 100, 150].map((percentage) => (
              <ToolButton
                key={percentage}
                label={`Zoom to ${percentage}%`}
                onClick={() => {
                  onChange(percentage / 100);
                  close(true);
                }}
              >
                {percentage}%
              </ToolButton>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/* Relationship rendering                                                     */
/* -------------------------------------------------------------------------- */

function CardinalityEnd({ x, y, direction, cardinality, color }) {
  const relation = cardinality || "1";
  const optional = relation.startsWith("0") || relation === "?";
  const many = relation.includes("*");
  const one = relation.includes("1") || !many;

  return (
    <>
      {optional && (
        <circle
          cx={x + direction * 4}
          cy={y}
          r={3.2}
          fill="none"
          stroke={color}
          strokeWidth={1.3}
        />
      )}

      {one && (
        <line
          x1={x + direction * 10}
          y1={y - 5}
          x2={x + direction * 10}
          y2={y + 5}
          stroke={color}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      )}
    </>
  );
}

function FlowArrow({ x, y, direction, color }) {
  return (
    <polyline
      points={`${x - direction * 6},${y - 4} ${x},${y} ${x - direction * 6},${y + 4}`}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ pointerEvents: "none" }}
    />
  );
}

function RelationshipLines({
  refs,
  tables,
  positions,
  widths,
  colors,
  overrides,
  hoveredTable,
  selectedTables,
  showAll,
  reverseFlow,
  theme,
  reducedMotion,
  onDragStart,
  onMoveLine,
}) {
  const instanceId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const selected = useMemo(() => new Set(selectedTables), [selectedTables]);

  const routes = useMemo(() => {
    const tableMap = new Map(tables.map((table) => [table.name, table]));
    const columnMaps = new Map(
      tables.map((table) => [
        table.name,
        new Map(table.columns.map((column, index) => [column.name, index])),
      ]),
    );

    const obstacles = tables.flatMap((table) => {
      const position = positions[table.name];
      if (!position) return [];

      return [{
        table: table.name,
        left: position.x - ROUTING_CLEARANCE,
        right:
          position.x +
          (widths[table.name] || TABLE_WIDTH) +
          ROUTING_CLEARANCE,
        top: position.y - ROUTING_CLEARANCE,
        bottom: position.y + getTableHeight(table) + ROUTING_CLEARANCE,
      }];
    });

    const items = [];

    for (const ref of refs) {
      const from = positions[ref.from.table];
      const to = positions[ref.to.table];

      if (
        !from ||
        !to ||
        !tableMap.has(ref.from.table) ||
        !tableMap.has(ref.to.table)
      ) {
        continue;
      }

      const fromIndex = columnMaps.get(ref.from.table)?.get(ref.from.column);
      const toIndex = columnMaps.get(ref.to.table)?.get(ref.to.column);

      if (fromIndex === undefined || toIndex === undefined) continue;

      const fromWidth = widths[ref.from.table] || TABLE_WIDTH;
      const toWidth = widths[ref.to.table] || TABLE_WIDTH;
      const fromRight = from.x + fromWidth;
      const toRight = to.x + toWidth;

      const overlap = Math.max(
        0,
        Math.min(fromRight, toRight) - Math.max(from.x, to.x),
      );

      let direction;

      if (
        ref.from.table === ref.to.table ||
        overlap / Math.min(fromWidth, toWidth) > 0.5
      ) {
        direction = "stack";
      } else if (to.x >= fromRight) {
        direction = "right";
      } else if (from.x >= toRight) {
        direction = "left";
      } else {
        direction =
          from.x + fromWidth / 2 <= to.x + toWidth / 2
            ? "right"
            : "left";
      }

      items.push({
        ref,
        from,
        to,
        fromIndex,
        toIndex,
        fromRight,
        toRight,
        direction,
        sourceEndpointY: getColumnY(from, fromIndex),
        fromLane: 0,
        fromLaneCount: 1,
        toLane: 0,
        toLaneCount: 1,
      });
    }

    const fromGroups = new Map();
    const toGroups = new Map();

    for (const item of items) {
      const fromKey = JSON.stringify([item.ref.from.table, item.direction]);
      const toSide =
        item.direction === "right" || item.direction === "stack"
          ? "left"
          : "right";
      const toKey = JSON.stringify([
        item.ref.to.table,
        item.ref.to.column,
        toSide,
      ]);

      if (!fromGroups.has(fromKey)) fromGroups.set(fromKey, []);
      if (!toGroups.has(toKey)) toGroups.set(toKey, []);

      fromGroups.get(fromKey).push(item);
      toGroups.get(toKey).push(item);
    }

    for (const group of fromGroups.values()) {
      group.sort(
        (a, b) =>
          a.fromIndex - b.fromIndex ||
          a.ref.routeKey.localeCompare(b.ref.routeKey),
      );

      group.forEach((item, index) => {
        item.fromLane = index;
        item.fromLaneCount = group.length;
      });
    }

    for (const group of toGroups.values()) {
      orderSharedColumnArrivals(group).forEach((item, index) => {
        item.toLane = index;
        item.toLaneCount = group.length;
      });
    }

    return items.map((item) => {
      const {
        ref,
        from,
        to,
        fromRight,
        toRight,
        fromIndex,
        toIndex,
        direction,
        fromLane,
        fromLaneCount,
        toLane,
        toLaneCount,
      } = item;

      const fromSide = direction === "right" ? 1 : -1;
      const toSide =
        direction === "right" || direction === "stack" ? -1 : 1;

      const x1 = fromSide === 1 ? fromRight + 1 : from.x - 1;
      const x2 = toSide === -1 ? to.x - 1 : toRight + 1;
      const y1 = getColumnY(from, fromIndex);

      const maxSpread = COL_HEIGHT / 2 - 6;
      const spacing =
        toLaneCount > 1
          ? Math.min(ARRIVAL_SPACING, (maxSpread * 2) / (toLaneCount - 1))
          : 0;

      let y2 =
        getColumnY(to, toIndex) +
        (toLane - (toLaneCount - 1) / 2) * spacing;

      // A same-row self-reference needs a visible loop rather than a zero-height path.
      if (ref.from.table === ref.to.table && Math.abs(y2 - y1) < 1) {
        y2 += 8;
      }

      const pathStartX = x1 + fromSide * 10;
      const pathEndX = x2 + toSide * 6;

      const symmetricOffset =
        (fromLane - (fromLaneCount - 1) / 2) * LANE_SPACING;

      const preferredMidX =
        direction === "stack"
          ? Math.min(from.x, to.x) - 30 - fromLane * LANE_SPACING
          : (pathStartX + pathEndX) / 2 +
            (direction === "right" ? symmetricOffset : -symmetricOffset);

      const points = routeOrthogonalConnection({
        start: { x: pathStartX, y: y1 },
        end: { x: pathEndX, y: y2 },
        preferredMidX,
        startDirection: fromSide,
        endDirection: toSide,
        obstacles: obstacles.filter(
          ({ table }) => table !== ref.from.table && table !== ref.to.table,
        ),
        manualMidX: overrides[ref.routeKey],
        lane: fromLane,
      });

      return {
        ...item,
        x1,
        x2,
        y1,
        y2,
        fromSide,
        toSide,
        path: orthogonalPointsToPath(points),
        segment: longestVerticalSegment(points),
      };
    });
  }, [refs, tables, positions, widths, overrides]);

  return routes.map((route, index) => {
    const {
      ref,
      x1,
      x2,
      y1,
      y2,
      fromSide,
      toSide,
      path,
      segment,
    } = route;

    const id = `sker-${instanceId}-relationship-${index}`;

    const active =
      showAll ||
      hoveredTable === ref.from.table ||
      hoveredTable === ref.to.table ||
      selected.has(ref.from.table) ||
      selected.has(ref.to.table);

    const filtering = !showAll && (hoveredTable || selected.size > 0);

    const color =
      normalizeColor(ref.color) ||
      (active ? colors[ref.from.table] || theme.line : theme.line);

    const description =
      `${ref.from.table}.${ref.from.column} ` +
      `(${ref.from.cardinality || "1"}) to ` +
      `${ref.to.table}.${ref.to.column} ` +
      `(${ref.to.cardinality || "1"})`;

    return (
      <g
        key={ref.routeKey}
        data-export-bounds="1"
        opacity={filtering && !active ? 0.2 : 1}
      >
        <title>
          {[
            ref.name && `Relationship: ${ref.name}`,
            description,
            ref.onDelete && `ON DELETE ${ref.onDelete}`,
            ref.onUpdate && `ON UPDATE ${ref.onUpdate}`,
            ref.inactive && "Inactive relationship",
          ].filter(Boolean).join("\n")}
        </title>

        <path
          id={id}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={1.3}
          strokeDasharray={ref.inactive ? "6 5" : undefined}
        />

        {segment && (
          <>
            <line
              data-export-hide="1"
              x1={segment.x}
              y1={segment.minY}
              x2={segment.x}
              y2={segment.maxY}
              stroke="transparent"
              strokeWidth={16}
              tabIndex={0}
              role="button"
              aria-label={`Reroute ${description}. Use left and right arrow keys.`}
              className="sker-line-handle"
              style={{ pointerEvents: "stroke", cursor: "col-resize" }}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (event.button !== 0) return;
                event.preventDefault();
                onDragStart(ref.routeKey, segment.x, event);
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();

                onMoveLine(
                  ref.routeKey,
                  segment.x +
                    (event.key === "ArrowLeft" ? -1 : 1) *
                      (event.shiftKey ? 20 : 5),
                );
              }}
            />
            <circle
              data-export-hide="1"
              cx={segment.x}
              cy={(segment.minY + segment.maxY) / 2}
              r={2.5}
              fill={color}
              opacity={active ? 0.7 : 0.35}
              style={{ pointerEvents: "none" }}
            />
          </>
        )}

        <CardinalityEnd
          x={x1}
          y={y1}
          direction={fromSide}
          cardinality={ref.from.cardinality}
          color={color}
        />
        <CardinalityEnd
          x={x2}
          y={y2}
          direction={toSide}
          cardinality={ref.to.cardinality}
          color={color}
        />

        <FlowArrow
          x={reverseFlow ? x2 + toSide * 18 : x1 + fromSide * 18}
          y={reverseFlow ? y2 : y1}
          direction={reverseFlow ? -toSide : -fromSide}
          color={color}
        />

        <text
          x={x1 + fromSide * 13}
          y={y1 - 7}
          textAnchor={fromSide === 1 ? "start" : "end"}
          fill={color}
          fontSize={11}
          fontWeight={700}
          fontFamily="'DM Sans', sans-serif"
        >
          {ref.from.cardinality}
        </text>

        <text
          x={x2 + toSide * 13}
          y={y2 - 7}
          textAnchor={toSide === 1 ? "start" : "end"}
          fill={color}
          fontSize={10}
          fontFamily="'DM Sans', sans-serif"
        >
          {ref.to.cardinality}
        </text>

        {active && !reducedMotion && (
          <circle data-export-hide="1" r={2.8} fill={color}>
            <animateMotion
              dur="1.8s"
              repeatCount="indefinite"
              keyPoints={reverseFlow ? "0;1" : "1;0"}
              keyTimes="0;1"
              calcMode="linear"
            >
              <mpath href={`#${id}`} />
            </animateMotion>
          </circle>
        )}
      </g>
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Diagram components                                                         */
/* -------------------------------------------------------------------------- */

function TableNode({
  table,
  position,
  width,
  color,
  theme,
  selected,
  dimmed,
  relationshipColumns,
  activeColumns,
  onPointerDown,
  onSelect,
  onMove,
  onContextMenu,
  onHover,
  onToggleCollapse,
}) {
  const metadata = [
    table.note && "note",
    table.indexes?.length > 0 && `${table.indexes.length} idx`,
    table.checks?.length > 0 && `${table.checks.length} check`,
    table.records?.length > 0 && `${table.records.length} data`,
  ].filter(Boolean);

  return (
    <div
      data-diagram-table={table.name}
      className="sker-table"
      role="group"
      tabIndex={0}
      aria-label={`${table.name}${selected ? ", selected" : ""}. Enter to select. Arrow keys to move. Shift F10 for options.`}
      onPointerDown={(event) => {
        event.stopPropagation();

        if (event.button !== 0) return;
        if (event.target.closest("button, input, a")) return;

        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });

        onPointerDown(table.name, event);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onSelect(table.name, event.ctrlKey || event.metaKey);
          return;
        }

        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();

          const bounds = event.currentTarget.getBoundingClientRect();

          onContextMenu(table.name, {
            clientX: bounds.left + 20,
            clientY: bounds.top + 20,
            ctrlKey: false,
            metaKey: false,
          });
          return;
        }

        const directions = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };

        const direction = directions[event.key];
        if (!direction) return;

        event.preventDefault();
        event.stopPropagation();

        const step = event.shiftKey ? 20 : 5;
        onMove(table.name, direction[0] * step, direction[1] * step);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(table.name, event);
      }}
      onDragStart={(event) => event.preventDefault()}
      onMouseEnter={() => onHover(table.name)}
      onMouseLeave={() => onHover(null)}
      title={[table.alias && `Alias: ${table.alias}`, table.note]
        .filter(Boolean).join("\n") || undefined}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width,
        boxSizing: "border-box",
        border: `${TABLE_BORDER}px solid ${selected ? color : theme.tableBorder}`,
        borderRadius: 6,
        overflow: "hidden",
        background: theme.tableBg,
        color: theme.columnText,
        opacity: dimmed ? 0.35 : 1,
        boxShadow: selected
          ? `0 0 0 2px ${color}, 0 8px 24px rgba(0,0,0,0.12)`
          : "0 2px 8px rgba(0,0,0,0.09)",
        cursor: "grab",
        userSelect: "none",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          height: HEADER_HEIGHT,
          boxSizing: "border-box",
          background: color,
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingRight: 12,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            padding: "4px 12px",
            background: "rgba(0,0,0,0.5)",
            borderRadius: "0 6px 6px 0",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {table.name}
        </span>

        <button
          type="button"
          data-export-hide="1"
          className="sker-collapse-button"
          aria-expanded={!table.isCollapsed}
          aria-label={
            table.isCollapsed
              ? `Expand ${table.name}`
              : `Collapse ${table.name} to keys`
          }
          title={
            table.isCollapsed
              ? `Expand ${table.name}; ${table.hiddenColumnCount} hidden columns`
              : `Collapse ${table.name} to keys`
          }
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapse(table.name);
          }}
        >
          {table.isCollapsed ? "▸" : "▾"}
        </button>
      </div>

      {table.columns.map((column, index) => {
        const related = relationshipColumns?.has(column.name);
        const highlighted = activeColumns?.has(column.name);

        return (
          <div
            key={column.name}
            title={[
              column.note,
              column.notNull && "NOT NULL",
              column.isUnique && "UNIQUE",
              column.increment && "AUTO INCREMENT",
              column.defaultValue != null && `Default: ${column.defaultValue}`,
            ].filter(Boolean).join(" · ") || undefined}
            style={{
              height: COL_HEIGHT,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
              padding: "0 12px",
              borderBottom:
                index < table.columns.length - 1
                  ? `1px solid ${theme.divider}`
                  : "none",
              background: highlighted ? theme.activeColumn : "transparent",
              fontSize: 12.5,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {(column.isPk || related) && (
                <span
                  aria-label={column.isPk ? "Primary key" : "Relationship column"}
                  title={column.isPk ? "Primary key" : "Relationship column"}
                  style={{
                    width: 12,
                    fontSize: 11,
                    color: column.isPk ? "#d97706" : "#6366f1",
                    fontWeight: 700,
                  }}
                >
                  {column.isPk ? "◆" : "↔"}
                </span>
              )}

              <span
                style={{
                  fontWeight: column.isPk ? 600 : 400,
                  fontStyle: related && !column.isPk ? "italic" : "normal",
                }}
              >
                {column.name}
              </span>
            </span>

            <span
              style={{
                display: "flex",
                gap: 5,
                alignItems: "center",
                color: theme.columnType,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
              }}
            >
              <span>{column.type}</span>
              {column.isUnique && !column.isPk && <small>UQ</small>}
              {column.increment && <small>++</small>}
              {column.notNull && !column.isPk && <small>NN</small>}
            </span>
          </div>
        );
      })}

      {hasTableMeta(table) && (
        <div
          title={table.note || metadata.join(" · ")}
          style={{
            height: TABLE_META_HEIGHT,
            boxSizing: "border-box",
            borderTop: `1px solid ${theme.divider}`,
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 9.5,
            color: theme.muted,
          }}
        >
          {metadata.map((item) => <span key={item}>{item}</span>)}
        </div>
      )}
    </div>
  );
}

function GroupOverlay({
  groups,
  visible,
  positions,
  tablesByName,
  widths,
  colors,
  selectedGroup,
  onSelect,
  onDragStart,
  onMove,
}) {
  if (!visible) return null;

  return groups.map((group, index) => {
    const bounds = getGroupBounds(group, positions, tablesByName, widths);
    if (!bounds) return null;

    const color =
      colors[group.name] ||
      normalizeColor(group.color) ||
      GROUP_COLORS[index % GROUP_COLORS.length];

    const selected = selectedGroup === group.name;
    const members = group.tables.filter((name) => tablesByName.has(name));

    return (
      <g key={group.name} data-export-bounds="1">
        {group.note && <title>{group.note}</title>}

        <rect
          {...bounds}
          rx={12}
          fill={color}
          opacity={0.06}
          style={{ pointerEvents: "none" }}
        />

        <rect
          {...bounds}
          rx={12}
          fill="none"
          stroke={color}
          strokeWidth={selected ? 2.5 : 1.5}
          strokeDasharray="7 4"
          opacity={selected ? 0.95 : 0.45}
          style={{ pointerEvents: "stroke", cursor: "pointer" }}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button === 0) onSelect(group.name);
          }}
        />

        <text
          x={bounds.x + 14}
          y={bounds.y + 20}
          fill={color}
          fontSize={11}
          fontWeight={700}
          fontFamily="'DM Sans', sans-serif"
          style={{ pointerEvents: "none" }}
        >
          {group.name}
        </text>

        <rect
          data-export-hide="1"
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={GROUP_LABEL_HEIGHT + 4}
          fill="transparent"
          rx={12}
          role="button"
          tabIndex={0}
          aria-label={`Group ${group.name}. Enter to select; arrow keys to move.`}
          className="sker-group-handle"
          style={{ pointerEvents: "all", cursor: "move" }}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 0) return;

            event.preventDefault();
            onSelect(group.name);
            onDragStart(members, event);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(group.name);
              return;
            }

            const directions = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };

            const direction = directions[event.key];
            if (!direction) return;

            event.preventDefault();
            event.stopPropagation();

            const step = event.shiftKey ? 20 : 5;
            onMove(members, direction[0] * step, direction[1] * step);
          }}
        />
      </g>
    );
  });
}

function MiniMap({ tables, positions, widths, colors, viewport, canvasSize, theme }) {
  const width = 160;
  const height = 100;

  const rectangles = tables.flatMap((table) => {
    const position = positions[table.name];
    if (!position) return [];

    return [{
      name: table.name,
      x: position.x,
      y: position.y,
      width: widths[table.name] || TABLE_WIDTH,
      height: getTableHeight(table),
    }];
  });

  const bounds = unionBounds(rectangles, 40);
  if (!bounds) return null;

  const scale = Math.min(width / bounds.width, height / bounds.height);
  const marginX = (width - bounds.width * scale) / 2;
  const marginY = (height - bounds.height * scale) / 2;

  return (
    <div
      className="sker-minimap"
      data-export-hide="1"
      data-canvas-wheel-ignore="1"
      onPointerDown={(event) => event.stopPropagation()}
      aria-label="Diagram overview"
      role="img"
      style={{ background: theme.legendBg }}
    >
      <svg width={width} height={height} aria-hidden="true">
        {rectangles.map((rectangle) => (
          <rect
            key={rectangle.name}
            x={marginX + (rectangle.x - bounds.x) * scale}
            y={marginY + (rectangle.y - bounds.y) * scale}
            width={rectangle.width * scale}
            height={rectangle.height * scale}
            fill={colors[rectangle.name]}
            rx={1}
            opacity={0.7}
          />
        ))}

        <rect
          x={
            marginX +
            (-viewport.offset.x / viewport.zoom - bounds.x) * scale
          }
          y={
            marginY +
            (-viewport.offset.y / viewport.zoom - bounds.y) * scale
          }
          width={(canvasSize.width / viewport.zoom) * scale}
          height={(canvasSize.height / viewport.zoom) * scale}
          fill="none"
          stroke="#10b981"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}

function LegendColorSwatch({ color, theme }) {
  const [hovered, setHovered] = useState(false);
  const [copyStatus, setCopyStatus] = useState("idle");
  const [tooltipPosition, setTooltipPosition] = useState(null);
  const swatchRef = useRef(null);
  const resetTimerRef = useRef(null);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      clearTimeout(resetTimerRef.current);
    };
  }, []);

  const showTooltip = () => {
    const bounds = swatchRef.current?.getBoundingClientRect();

    if (bounds) {
      setTooltipPosition({
        left: bounds.left + bounds.width / 2,
        top: bounds.top - 7,
      });
    }

    setHovered(true);
  };

  const copy = async () => {
    const operation = ++operationRef.current;
    let status;

    try {
      await copyTextToClipboard(color);
      status = "copied";
    } catch {
      status = "error";
    }

    if (!mountedRef.current || operation !== operationRef.current) return;

    setCopyStatus(status);
    clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      if (mountedRef.current && operation === operationRef.current) {
        setCopyStatus("idle");
      }
    }, 1200);
  };

  const tooltipText = copyStatus === "copied"
    ? "Copied"
    : copyStatus === "error"
      ? "Copy failed"
      : color.toUpperCase();

  return (
    <button
      ref={swatchRef}
      type="button"
      className="sker-legend-swatch"
      style={{ background: color }}
      aria-label={`Copy color ${color.toUpperCase()}`}
      onClick={copy}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setHovered(false)}
      onFocus={showTooltip}
      onBlur={() => setHovered(false)}
    >
      {(hovered || copyStatus !== "idle") && tooltipPosition && createPortal(
        <span
          className="sker-legend-tooltip"
          data-export-hide="1"
          role="status"
          style={{
            left: tooltipPosition.left,
            top: tooltipPosition.top,
            color: theme.text,
            background: theme.panelBg,
            borderColor: theme.border,
          }}
        >
          {tooltipText}
          <span
            aria-hidden="true"
            style={{
              borderColor: theme.border,
              background: theme.panelBg,
            }}
          />
        </span>,
        document.body,
      )}
    </button>
  );
}

function ColorLegend({
  entries,
  descriptions,
  onChange,
  legendRef,
  theme,
}) {
  return (
    <section
      ref={legendRef}
      className="sker-legend"
      data-color-legend="1"
      data-canvas-wheel-ignore="1"
      aria-label="Color legend"
      style={{ background: theme.legendBg }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <div data-color-legend-items="1" className="sker-legend-items">
        {!entries.length && (
          <p className="sker-muted">Table colors will appear here.</p>
        )}

        {entries.map(({ color }) => (
          <div key={color} className="sker-inline">
            <LegendColorSwatch color={color} theme={theme} />
            <input
              type="text"
              value={descriptions[color] || ""}
              maxLength={20_000}
              placeholder="Add description…"
              aria-label={`Description for ${color}`}
              onChange={(event) => onChange(color, event.target.value)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialogs                                                                    */
/* -------------------------------------------------------------------------- */

function ShareQrDialog({
  url,
  fileName,
  onCopy,
  copyStatus,
  onClose,
  restoreFocusRef,
}) {
  const [result, setResult] = useState({ dataUrl: null, error: null });

  useEffect(() => {
    let active = true;
    setResult({ dataUrl: null, error: null });

    Promise.resolve()
      .then(() => generateShareQrDataUrl(url))
      .then((next) => {
        if (active) {
          setResult({
            dataUrl: next?.dataUrl || null,
            error: next?.error || (!next?.dataUrl ? "unknown" : null),
          });
        }
      })
      .catch(() => {
        if (active) setResult({ dataUrl: null, error: "unknown" });
      });

    return () => {
      active = false;
    };
  }, [url]);

  let host = "Local file";
  let localOnly = false;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");

    host = parsed.host || "Local file";
    localOnly =
      parsed.protocol === "file:" ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]" ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname);
  } catch {
    localOnly = true;
  }

  return (
    <Dialog
      title="Share via QR code"
      onClose={onClose}
      restoreFocusRef={restoreFocusRef}
    >
      <p>Scan to open <strong>{fileName || "this diagram"}</strong>.</p>

      <div className="sker-qr-panel" aria-live="polite">
        {result.dataUrl ? (
          <img
            src={result.dataUrl}
            width={320}
            height={320}
            alt="QR code for the shared diagram"
          />
        ) : result.error ? (
          <p>
            {result.error === SHARE_QR_TOO_LARGE
              ? "This diagram is too large for a QR code. Copy the shareable link instead."
              : "Unable to generate a QR code. You can still copy the shareable link."}
          </p>
        ) : (
          <p>Generating QR code…</p>
        )}
      </div>

      <div className="sker-inline sker-between sker-muted">
        <span className="sker-truncate">{host}</span>
        <span>{url.length.toLocaleString()} characters</span>
      </div>

      {localOnly && (
        <p className="sker-warning">
          This address is local to this device. Serve SketchER at a deployed or
          network-accessible URL before sharing with a phone.
        </p>
      )}

      <ToolButton
        label="Copy shareable link"
        className="sker-primary"
        onClick={() => void onCopy(url)}
      >
        {copyStatus === "copied"
          ? "Link copied"
          : copyStatus === "error"
            ? "Copy failed — retry"
            : "Copy shareable link"}
      </ToolButton>

      <p className="sker-muted">
        QR generation happens locally. The link contains a snapshot of the
        diagram; treat it as shared data, not a private access-controlled link.
      </p>
    </Dialog>
  );
}

function HelpDialog({ onClose, restoreFocusRef }) {
  return (
    <Dialog
      title="SketchER reference"
      onClose={onClose}
      restoreFocusRef={restoreFocusRef}
      wide
    >
      <nav className="sker-help-nav" aria-label="Reference sections">
        <a href="#sker-help-tables">Tables</a>
        <a href="#sker-help-relationships">Relationships</a>
        <a href="#sker-help-groups">Groups</a>
        <a href="#sker-help-canvas">Canvas</a>
        <a href="#sker-help-saving">Saving and sharing</a>
      </nav>

      <section id="sker-help-tables">
        <h3>Tables and advanced DBML</h3>
        <p>
          The editor uses the project’s DBML parser. Schemas, quoted identifiers,
          aliases, parameterized types, defaults, notes, indexes, and other
          supported DBML metadata are preserved in the parsed model.
        </p>
        <pre>{`Table core.users as U [headercolor: #3498db] {
  id bigint [pk, increment]
  email varchar(255) [not null, unique]
  balance decimal(10,2) [default: 0]
  full_name "character varying" [note: 'Display name']

  indexes {
    (email, full_name) [name: 'users_search_idx']
  }
}`}</pre>
        <p>
          Invalid edits show diagnostics while the canvas retains the last valid
          model from the current document. Opening a different file never reuses
          the previous file’s model.
        </p>
      </section>

      <section id="sker-help-relationships">
        <h3>Relationships</h3>
        <pre>{`Table orders {
  id int [pk]
  user_id int [ref: > users.id]
}

Ref order_owner {
  sales.orders.(tenant_id, user_id) > core.users.(tenant_id, id)
}`}</pre>
        <p>
          Cardinalities: <code>&lt;</code> one-to-many, <code>&gt;</code>{" "}
          many-to-one, <code>-</code> one-to-one, and <code>&lt;&gt;</code>{" "}
          many-to-many. Optional endpoint syntax depends on the parser version.
        </p>
        <p>
          Drag a relationship’s vertical grip to reroute it. Keyboard users can
          focus a grip and use Left/Right; hold Shift for larger steps.
          Reversing display flow does not change relationship cardinality.
        </p>
      </section>

      <section id="sker-help-groups">
        <h3>Groups and colors</h3>
        <pre>{`TableGroup Auth [color: #8b5cf6] {
  core.users
  core.roles
}`}</pre>
        <p>
          Ctrl/Cmd-click tables to select multiple tables. Right-click, or use
          Shift+F10 on a focused table, to create a group. Drag a group’s label
          strip to move all members and its manually positioned internal routes.
        </p>
        <p>
          Palette colors are explicit UI overrides. Use “Use DBML/default color”
          to remove a table override. Applying a color to multiple selected
          tables creates related shades.
        </p>
      </section>

      <section id="sker-help-canvas">
        <h3>Canvas controls</h3>
        <ul>
          <li>Drag empty canvas to pan.</li>
          <li>Two-finger trackpad scrolling pans in both axes.</li>
          <li>Ctrl/Cmd-wheel or trackpad pinch zooms around the pointer.</li>
          <li>Touch and pen dragging use pointer events.</li>
          <li>Touch users can use the zoom buttons or slider.</li>
          <li>Focus a table: Enter selects; arrow keys move it.</li>
          <li>Hold Shift with arrow keys for larger movement steps.</li>
          <li>Focus the canvas: arrows pan, +/− zoom, F fits, 0 resets.</li>
          <li>Collapse tables to retain primary and relationship columns.</li>
          <li>Smart layout groups tables; hierarchy layout emphasizes lineage.</li>
        </ul>
        <p>
          Large diagrams can fit down to 5% zoom. Reduced-motion system
          preferences disable animated relationship particles.
        </p>
      </section>

      <section id="sker-help-saving">
        <h3>Saving, export, and sharing</h3>
        <ul>
          <li>
            Autosave runs after 400 ms of inactivity, with a two-second maximum
            wait during continuous changes.
          </li>
          <li>
            Save downloads a versioned <code>.sker</code> JSON document.
          </li>
          <li>
            Open validates the complete document before replacing current state.
          </li>
          <li>PNG export includes the visible legend.</li>
          <li>Share creates a snapshot link; QR codes have a smaller size limit.</li>
        </ul>
        <p>
          Browser storage can fail or be cleared. Keep downloaded backups for
          important diagrams. Opening a shared snapshot removes its hash from
          the address bar so a later reload restores the edited autosave rather
          than reopening the original snapshot.
        </p>
      </section>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Monaco                                                                     */
/* -------------------------------------------------------------------------- */

function configureMonaco(monaco) {
  if (!monaco.languages.getLanguages().some((language) => language.id === "dbml")) {
    monaco.languages.register({ id: "dbml" });
  }

  monaco.languages.setMonarchTokensProvider("dbml", dbmlMonarchTokensProvider);
  monaco.languages.setLanguageConfiguration("dbml", dbmlLanguageConfig);

  monaco.editor.defineTheme("dbml-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "d73a49", fontStyle: "bold" },
      { token: "type", foreground: "005cc5" },
      { token: "attribute", foreground: "22863a" },
      { token: "comment", foreground: "6a737d", fontStyle: "italic" },
      { token: "string", foreground: "032f62" },
      { token: "number", foreground: "005cc5" },
      { token: "operator", foreground: "d73a49" },
    ],
    colors: {
      "editor.background": LIGHT_THEME.editorBg,
      "editor.foreground": LIGHT_THEME.text,
      "editor.lineHighlightBackground": "#e8e8e8",
      "editorLineNumber.foreground": "#777777",
      "editor.selectionBackground": "#10b98130",
      "editor.findMatchBackground": "#10b98140",
    },
  });

  monaco.editor.defineTheme("dbml-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "f97583", fontStyle: "bold" },
      { token: "type", foreground: "79b8ff" },
      { token: "attribute", foreground: "85e89d" },
      { token: "comment", foreground: "959daa", fontStyle: "italic" },
      { token: "string", foreground: "9ecbff" },
      { token: "number", foreground: "79b8ff" },
      { token: "operator", foreground: "f97583" },
    ],
    colors: {
      "editor.background": DARK_THEME.editorBg,
      "editor.foreground": DARK_THEME.text,
      "editor.lineHighlightBackground": "#303034",
      "editorLineNumber.foreground": "#96969e",
      "editor.selectionBackground": "#10b98130",
      "editor.findMatchBackground": "#10b98140",
    },
  });
}

const MONACO_OPTIONS = {
  fontSize: 12.5,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontLigatures: true,
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: "line",
  lineNumbers: "on",
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: true,
  automaticLayout: true,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: "on",
  padding: { top: 10 },
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
};

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const STYLES = `
.sker-root,
.sker-root *,
.sker-dialog-backdrop,
.sker-dialog-backdrop * {
  box-sizing: border-box;
}

.sker-root {
  display: flex;
  width: 100%;
  height: 100dvh;
  min-height: 320px;
  overflow: hidden;
  background: var(--sker-app);
  color: var(--sker-text);
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 12px;
}

.sker-root button,
.sker-root input,
.sker-dialog button,
.sker-dialog input {
  font: inherit;
}

.sker-root button,
.sker-dialog button {
  touch-action: manipulation;
}

.sker-root :focus-visible,
.sker-dialog :focus-visible {
  outline: 2px solid #10b981;
  outline-offset: 3px;
}

.sker-root input:not([type="color"]):not([type="range"]):not([type="checkbox"]),
.sker-dialog input:not([type="color"]):not([type="range"]):not([type="checkbox"]) {
  min-width: 0;
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--sker-border);
  border-radius: 6px;
  color: var(--sker-text);
  background: var(--sker-editor);
}

.sker-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--sker-border);
  border-radius: 7px;
  color: var(--sker-secondary);
  background: var(--sker-panel);
  cursor: pointer;
  white-space: nowrap;
}

.sker-button:hover:not(:disabled) {
  background: var(--sker-soft);
}

.sker-button:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.sker-primary {
  color: white;
  background: #047857;
  border-color: #047857;
}

.sker-primary:hover:not(:disabled) {
  background: #065f46;
}

.sker-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.sker-between { justify-content: space-between; }
.sker-grow { flex: 1; min-width: 0; }
.sker-stack { display: flex; flex-direction: column; gap: 10px; }
.sker-muted { color: var(--sker-muted); font-size: 11px; line-height: 1.5; }
.sker-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sker-editor {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--sker-editor);
  border-right: 1px solid var(--sker-border);
}

.sker-editor-header {
  padding: 14px;
  border-bottom: 1px solid var(--sker-border);
}

.sker-logo { font-size: 18px; letter-spacing: .2px; }
.sker-logo span { color: #10b981; }

.sker-editor-content { flex: 1; min-height: 0; overflow: hidden; }
.sker-editor-stats { padding: 8px 14px; border-bottom: 1px solid var(--sker-border); }
.sker-editor-footer { padding: 10px 14px; border-top: 1px solid var(--sker-border); }
.sker-editor-footer a { color: #059669; }

.sker-palette { padding: 10px 14px; border-bottom: 1px solid var(--sker-border); }
.sker-color-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.sker-color-dot {
  width: 23px;
  height: 23px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}
.sker-color-dot.is-selected { outline: 2px solid var(--sker-text); outline-offset: 1px; }

.sker-color-picker {
  position: relative;
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--sker-border);
  border-radius: 50%;
  background: conic-gradient(#f87171,#fbbf24,#34d399,#22d3ee,#818cf8,#f472b6,#f87171);
  cursor: pointer;
}
.sker-color-picker span { color: white; }
.sker-color-picker input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.sker-color-picker:focus-within { outline: 2px solid #10b981; outline-offset: 3px; }

.sker-resizer {
  flex-shrink: 0;
  width: 5px;
  cursor: col-resize;
  touch-action: none;
}
.sker-resizer:hover,
.sker-resizer:focus { background: #10b98180; }

.sker-canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: none;
}

.sker-topbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 30;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
}
.sker-topbar > * { pointer-events: auto; }
.sker-toolbar { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.sker-filename { max-width: min(230px, 65vw); }

.sker-popover-container { position: relative; }
.sker-popover {
  position: absolute;
  top: calc(100% + 8px);
  width: min(280px, calc(100vw - 30px));
  padding: 12px;
  border: 1px solid var(--sker-border);
  border-radius: 10px;
  background: var(--sker-panel);
  color: var(--sker-text);
  box-shadow: 0 10px 30px #0003;
  z-index: 60;
}
.sker-popover-right { right: 0; }
.sker-popover-left { left: 0; }
.sker-popover input[type="range"] { width: 100%; accent-color: #10b981; }

.sker-collapse-button {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: 0;
  border-radius: 5px;
  background: #0003;
  color: white;
  cursor: pointer;
}

.sker-line-handle:focus { stroke: #10b98166; }
.sker-group-handle:focus { stroke: #10b981; stroke-width: 2; }

.sker-bottom-controls {
  position: absolute;
  z-index: 25;
  left: 12px;
  bottom: 12px;
  max-width: calc(100% - 196px);
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--sker-border);
  border-radius: 9px;
  background: var(--sker-panel);
}

.sker-toggle-label { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
.sker-toggle-input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.sker-toggle-track {
  width: 32px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--sker-border);
  position: relative;
}
.sker-toggle-track span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: white;
  transition: transform .15s;
}
.sker-toggle-input:checked + .sker-toggle-track { background: #047857; }
.sker-toggle-input:checked + .sker-toggle-track span { transform: translateX(14px); }
.sker-toggle-input:focus-visible + .sker-toggle-track { outline: 2px solid #10b981; outline-offset: 3px; }

.sker-minimap {
  position: absolute;
  z-index: 24;
  bottom: 12px;
  right: 12px;
  width: 162px;
  height: 102px;
  overflow: hidden;
  border: 1px solid var(--sker-border);
  border-radius: 8px;
}

.sker-legend {
  position: absolute;
  right: 12px;
  top: var(--sker-chrome-top, 64px);
  z-index: 22;
  width: min(226px, calc(100% - 24px));
  max-height: calc(100% - var(--sker-chrome-top, 64px) - 126px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--sker-border);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 22px #0002;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.sker-legend-items { display: flex; flex-direction: column; gap: 7px; padding: 8px; min-height: 0; overflow: auto; }
.sker-legend-swatch { width: 34px; height: 32px; border: 1px solid var(--sker-border); border-radius: 7px; flex-shrink: 0; cursor: copy; }
.sker-legend-tooltip {
  position: fixed;
  z-index: 1000;
  transform: translate(-50%, -100%);
  padding: 5px 8px;
  border: 1px solid;
  border-radius: 6px;
  box-shadow: 0 4px 12px #0003;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
}
.sker-legend-tooltip > span {
  position: absolute;
  left: 50%;
  bottom: -4px;
  width: 7px;
  height: 7px;
  transform: translateX(-50%) rotate(45deg);
  border-right: 1px solid;
  border-bottom: 1px solid;
}

.sker-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px;
  text-align: center;
  color: var(--sker-muted);
  pointer-events: none;
}

.sker-notice {
  position: absolute;
  z-index: 50;
  left: 12px;
  top: var(--sker-chrome-top, 64px);
  max-width: min(460px, calc(100% - 24px));
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid #10b981;
  border-radius: 8px;
  background: var(--sker-panel);
  box-shadow: 0 4px 16px #0002;
}
.sker-notice-error { border-color: #ef4444; }

.sker-context {
  position: fixed;
  z-index: 100;
  width: min(290px, calc(100vw - 16px));
  max-height: calc(100dvh - 16px);
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--sker-border);
  border-radius: 10px;
  background: var(--sker-panel);
  color: var(--sker-text);
  box-shadow: 0 12px 34px #0004;
}

.sker-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0009;
  backdrop-filter: blur(4px);
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 12px;
  color: var(--sker-text);
}
.sker-dialog {
  width: min(440px, 100%);
  max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--sker-border);
  border-radius: 14px;
  background: var(--sker-panel);
  box-shadow: 0 24px 70px #0006;
}
.sker-dialog-wide { width: min(800px, 100%); }
.sker-dialog-header { padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--sker-border); }
.sker-dialog-header h2 { margin: 0; font-size: 16px; }
.sker-dialog-content { padding: 18px; overflow: auto; overscroll-behavior: contain; line-height: 1.65; }
.sker-dialog pre { padding: 12px; border: 1px solid var(--sker-border); border-radius: 7px; overflow: auto; background: var(--sker-editor); font-size: 11px; }
.sker-dialog section { scroll-margin-top: 12px; margin-bottom: 28px; }
.sker-help-nav { display: flex; flex-wrap: wrap; gap: 12px; }
.sker-help-nav a { color: #059669; }
.sker-qr-panel { display: flex; justify-content: center; align-items: center; min-height: 320px; padding: 10px; background: white; color: #374151; border-radius: 10px; margin: 14px 0; text-align: center; }
.sker-qr-panel img { display: block; max-width: 100%; height: auto; }
.sker-warning { padding: 10px; border: 1px solid #f59e0b88; border-radius: 7px; background: #f59e0b15; }

.sker-editor-glow-line { background: #10b98128; }

.monaco-editor .find-widget {
  top: 30px !important;
}
body:has(.find-widget .codicon-find-selection:hover) .workbench-hover.compact .hover-contents,
body:has(.find-widget .codicon-widget-close:hover) .workbench-hover.compact .hover-contents {
  white-space: nowrap !important;
}
body:has(.find-widget .codicon-find-selection:hover) .workbench-hover-container:has(> .workbench-hover.compact),
body:has(.find-widget .codicon-widget-close:hover) .workbench-hover-container:has(> .workbench-hover.compact) {
  pointer-events: none !important;
}

.sker-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 760px) {
  .sker-editor { position: absolute; z-index: 80; top: 0; bottom: 0; left: 0; max-width: 92vw; box-shadow: 8px 0 30px #0003; }
  .sker-resizer { display: none; }
  .sker-minimap { display: none; }
  .sker-bottom-controls { max-width: calc(100% - 24px); gap: 8px; }
  .sker-toolbar { justify-content: flex-start; }
  .sker-legend { max-height: calc(100% - var(--sker-chrome-top, 64px) - 100px); }
}

@media (prefers-reduced-motion: reduce) {
  .sker-root *, .sker-dialog * { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
}
`;

/* -------------------------------------------------------------------------- */
/* Main application                                                           */
/* -------------------------------------------------------------------------- */

export default function SketchER() {
  const [state, dispatch] = useReducer(
    documentReducer,
    undefined,
    initializeApplication,
  );

  const { data, model } = state;
  const theme = data.isDark ? DARK_THEME : LIGHT_THEME;
  const reducedMotion = useReducedMotion();

  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const legendRef = useRef(null);
  const topbarRef = useRef(null);
  const loadInputRef = useRef(null);
  const shareTriggerRef = useRef(null);
  const helpTriggerRef = useRef(null);
  const editorPanelRef = useRef(null);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const glowTimerRef = useRef(null);
  const glowDecorationsRef = useRef([]);

  const mountedRef = useRef(true);
  const layoutRequestRef = useRef(0);
  const loadRequestRef = useRef(0);
  const copyRequestRef = useRef(0);
  const copyTimerRef = useRef(null);
  const recentTimerRef = useRef(null);
  const pendingRecentRef = useRef([]);

  const [editorMounted, setEditorMounted] = useState(false);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [exportRunning, setExportRunning] = useState(false);
  const [loadRunning, setLoadRunning] = useState(false);
  const [copyStatus, setCopyStatus] = useState("idle");
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(() =>
    state.startupWarnings.length
      ? { text: state.startupWarnings.join(" "), kind: "error" }
      : null,
  );

  const [contextMenu, setContextMenu] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const contextRef = useRef(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(data.fileName);
  const nameInputRef = useRef(null);

  const [viewport, setViewport] = useState(
    () => data.viewport || { zoom: 1, offset: { x: 0, y: 0 } },
  );

  const [fitRequest, setFitRequest] = useState(() => data.viewport ? 0 : 1);
  const handledFitRef = useRef(0);

  const canvasSize = useElementSize(canvasRef);
  const topbarSize = useElementSize(topbarRef);

  const stateRef = useLatest(state);
  const viewportRef = useLatest(viewport);
  const canvasSizeRef = useLatest(canvasSize);
  const dialogRef = useLatest(dialog);

  const tables = modelTables(model);
  const groups = modelGroups(model);

  const refs = useMemo(
    () => identifyRelationships(model, data.tableIds),
    [model, data.tableIds],
  );

  const refsRef = useLatest(refs);

  const tablesByName = useMemo(
    () => new Map(tables.map((table) => [table.name, table])),
    [tables],
  );

  const relationshipColumns = useMemo(() => {
    const map = new Map();

    for (const ref of refs) {
      for (const endpoint of [ref.from, ref.to]) {
        if (!map.has(endpoint.table)) map.set(endpoint.table, new Set());

        for (const column of endpoint.columns || [endpoint.column]) {
          map.get(endpoint.table).add(column);
        }
      }
    }

    return map;
  }, [refs]);

  const collapsedSet = useMemo(
    () => new Set(data.collapsedTables),
    [data.collapsedTables],
  );

  const diagramTables = useMemo(
    () => tables.map((table) => {
      if (!collapsedSet.has(table.name)) {
        return { ...table, isCollapsed: false, hiddenColumnCount: 0 };
      }

      const columns = table.columns.filter(
        (column) =>
          column.isPk ||
          relationshipColumns.get(table.name)?.has(column.name),
      );

      return {
        ...table,
        columns,
        isCollapsed: true,
        hiddenColumnCount: table.columns.length - columns.length,
      };
    }),
    [tables, collapsedSet, relationshipColumns],
  );

  const diagramTablesByName = useMemo(
    () => new Map(diagramTables.map((table) => [table.name, table])),
    [diagramTables],
  );

  const tableWidths = useTableWidths(diagramTables, relationshipColumns);

  const effectiveColors = useMemo(() => {
    const colors = dictionary();

    for (const table of tables) {
      colors[table.name] =
        data.tableColors[table.name] ||
        normalizeColor(table.headerColor) ||
        TABLE_COLORS[
          stableHash(data.tableIds[table.name] || table.name) % TABLE_COLORS.length
        ];
    }

    return colors;
  }, [tables, data.tableColors, data.tableIds]);

  const legendEntries = useMemo(
    () => [...new Set(Object.values(effectiveColors))]
      .sort()
      .map((color) => ({ color })),
    [effectiveColors],
  );

  const activeColumns = useMemo(() => {
    const map = new Map();
    if (!state.hoveredTable) return map;

    for (const ref of refs) {
      if (
        ref.from.table !== state.hoveredTable &&
        ref.to.table !== state.hoveredTable
      ) {
        continue;
      }

      for (const endpoint of [ref.from, ref.to]) {
        if (!map.has(endpoint.table)) map.set(endpoint.table, new Set());

        for (const column of endpoint.columns || [endpoint.column]) {
          map.get(endpoint.table).add(column);
        }
      }
    }

    return map;
  }, [refs, state.hoveredTable]);

  const connectedTables = useMemo(() => {
    if (!state.hoveredTable) return null;

    const connected = new Set([state.hoveredTable]);

    for (const ref of refs) {
      if (ref.from.table === state.hoveredTable) connected.add(ref.to.table);
      if (ref.to.table === state.hoveredTable) connected.add(ref.from.table);
    }

    return connected;
  }, [refs, state.hoveredTable]);

  const selectedSet = useMemo(
    () => new Set(state.selectedTables),
    [state.selectedTables],
  );

  const allCollapsed =
    tables.length > 0 && tables.every((table) => collapsedSet.has(table.name));

  const deferredInput = useDeferredValue(
    useMemo(() => ({ dbml: data.dbml, epoch: state.epoch }), [data.dbml, state.epoch]),
  );

  const parsedResult = useMemo(
    () => parseDocument(deferredInput.dbml),
    [deferredInput],
  );

  useEffect(() => {
    if (
      state.parsedSource === deferredInput.dbml &&
      state.epoch === deferredInput.epoch
    ) {
      return;
    }

    dispatch({
      type: "parsed",
      source: deferredInput.dbml,
      epoch: deferredInput.epoch,
      result: parsedResult,
    });
  }, [
    deferredInput,
    parsedResult,
    state.parsedSource,
    state.epoch,
  ]);

  const snapshot = useMemo(
    () => ({
      ...data,
      version: DOCUMENT_VERSION,
      viewport,
    }),
    [data, viewport],
  );

  const snapshotRef = useLatest(snapshot);
  const { status: saveStatus, flush: flushAutosave } = useAutosave(snapshot);

  const notify = useCallback((text, kind = "info") => {
    setNotice({ text, kind });
  }, []);

  const patch = useCallback((patchValue, geometry = false) => {
    dispatch({ type: "patch", patch: patchValue, geometry });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      layoutRequestRef.current += 1;
      loadRequestRef.current += 1;
      copyRequestRef.current += 1;
      clearTimeout(copyTimerRef.current);
      clearTimeout(recentTimerRef.current);
      clearTimeout(glowTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!state.fromShare) return;

    try {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    } catch {
      notify(
        "The shared snapshot opened, but its URL could not be cleared. Reloading may reopen the original snapshot.",
        "error",
      );
    }
  }, [state.fromShare, notify]);

  useLayoutEffect(() => {
    if (!rootRef.current) return;

    rootRef.current.inert = Boolean(dialog);

    return () => {
      if (rootRef.current) rootRef.current.inert = false;
    };
  }, [dialog]);

  useLayoutEffect(() => {
    if (editorPanelRef.current) {
      editorPanelRef.current.inert = data.isEditorCollapsed;
    }
  }, [data.isEditorCollapsed]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  /* ----------------------------- Viewport -------------------------------- */

  const applyViewport = useCallback((next) => {
    const value = typeof next === "function" ? next(viewportRef.current) : next;

    const normalized = {
      zoom: clampZoom(value.zoom),
      offset: {
        x: clamp(value.offset.x, -MAX_COORDINATE, MAX_COORDINATE),
        y: clamp(value.offset.y, -MAX_COORDINATE, MAX_COORDINATE),
      },
    };

    viewportRef.current = normalized;
    setViewport(normalized);
  }, [viewportRef]);

  const setCanvasZoom = useCallback((requestedZoom, focalPoint) => {
    const current = viewportRef.current;
    const size = canvasSizeRef.current;

    const focal = focalPoint || {
      x: size.width / 2,
      y: size.height / 2,
    };

    const zoom = clampZoom(requestedZoom);
    const scale = zoom / current.zoom;

    applyViewport({
      zoom,
      offset: {
        x: focal.x - (focal.x - current.offset.x) * scale,
        y: focal.y - (focal.y - current.offset.y) * scale,
      },
    });
  }, [applyViewport, viewportRef, canvasSizeRef]);

  const resetView = useCallback(() => {
    applyViewport({ zoom: 1, offset: { x: 0, y: 0 } });
  }, [applyViewport]);

  const fitToCanvas = useCallback(() => {
    const size = canvasSizeRef.current;
    if (!size.width || !size.height) return;

    const rectangles = diagramTables.flatMap((table) => {
      const position = data.tablePositions[table.name];
      if (!position) return [];

      return [{
        ...position,
        width: tableWidths[table.name] || TABLE_WIDTH,
        height: getTableHeight(table),
      }];
    });

    const svg = sceneRef.current?.querySelector("[data-diagram-svg]");

    svg?.querySelectorAll("[data-export-bounds]").forEach((element) => {
      try {
        const bounds = element.getBBox();

        if (bounds.width || bounds.height) {
          rectangles.push({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          });
        }
      } catch {
        // Detached or non-rendered SVG nodes have no usable bounding box.
      }
    });

    const bounds = unionBounds(rectangles, 35);
    if (!bounds) return;

    const top = Math.min(topbarSize.height + 30, size.height / 2);
    const bottom = 110;
    const right =
      data.colorLegendVisible && size.width > 650 ? 250 : 20;

    const availableWidth = Math.max(1, size.width - right - 20);
    const availableHeight = Math.max(1, size.height - top - bottom);

    const zoom = clampZoom(Math.min(
      availableWidth / bounds.width,
      availableHeight / bounds.height,
    ));

    applyViewport({
      zoom,
      offset: {
        x: 20 + (availableWidth - bounds.width * zoom) / 2 - bounds.x * zoom,
        y: top + (availableHeight - bounds.height * zoom) / 2 - bounds.y * zoom,
      },
    });
  }, [
    applyViewport,
    canvasSizeRef,
    diagramTables,
    data.tablePositions,
    data.colorLegendVisible,
    tableWidths,
    topbarSize.height,
  ]);

  useLayoutEffect(() => {
    if (
      handledFitRef.current === fitRequest ||
      !canvasSize.width ||
      !canvasSize.height ||
      state.parsedSource !== data.dbml
    ) {
      return;
    }

    handledFitRef.current = fitRequest;
    fitToCanvas();
  }, [
    fitRequest,
    canvasSize,
    state.parsedSource,
    data.dbml,
    fitToCanvas,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const handleWheel = (event) => {
      if (dialogRef.current || interactionRef.current) return;

      if (
        event.target instanceof Element &&
        event.target.closest("[data-canvas-wheel-ignore]")
      ) {
        return;
      }

      event.preventDefault();

      const size = canvasSizeRef.current;
      const modeScale =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? Math.max(size.height, 1)
            : 1;

      const dx = event.deltaX * modeScale;
      const dy = event.deltaY * modeScale;

      if (event.ctrlKey || event.metaKey) {
        const bounds = canvas.getBoundingClientRect();

        setCanvasZoom(
          viewportRef.current.zoom * Math.exp(-dy * 0.0025),
          {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          },
        );
      } else {
        const panX = event.shiftKey && dx === 0 ? dy : dx;
        const panY = event.shiftKey && dx === 0 ? 0 : dy;

        applyViewport((current) => ({
          ...current,
          offset: {
            x: current.offset.x - panX,
            y: current.offset.y - panY,
          },
        }));
      }
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [applyViewport, setCanvasZoom, canvasSizeRef, viewportRef, dialogRef]);

  /* ---------------------------- Interaction ------------------------------ */

  const interactionRef = useRef(null);
  const pointerFrameRef = useRef(null);
  const latestPointerRef = useRef(null);
  const [interactionActive, setInteractionActive] = useState(false);

  const flushPointer = useCallback(() => {
    pointerFrameRef.current = null;

    const interaction = interactionRef.current;
    const pointer = latestPointerRef.current;
    if (!interaction || !pointer) return;

    const dx = pointer.x - interaction.startX;
    const dy = pointer.y - interaction.startY;

    if (interaction.type === "pan") {
      applyViewport({
        zoom: interaction.zoom,
        offset: {
          x: interaction.offset.x + dx,
          y: interaction.offset.y + dy,
        },
      });
    } else if (interaction.type === "tables") {
      const positions = dictionary();

      for (const [name, start] of Object.entries(interaction.positions)) {
        positions[name] = {
          x: start.x + dx / interaction.zoom,
          y: start.y + dy / interaction.zoom,
        };
      }

      const lineOverrides = dictionary();

      for (const [key, start] of Object.entries(interaction.lineOverrides)) {
        lineOverrides[key] = start + dx / interaction.zoom;
      }

      dispatch({ type: "positions", positions, lineOverrides });
    } else if (interaction.type === "line") {
      dispatch({
        type: "line",
        key: interaction.key,
        x: interaction.x + dx / interaction.zoom,
      });
    } else if (interaction.type === "resize") {
      patch({
        editorWidth: clamp(
          interaction.width + dx,
          280,
          Math.min(700, Math.max(280, window.innerWidth - 180)),
        ),
      });
    }
  }, [applyViewport, patch]);

  const finishInteraction = useCallback((flush = true) => {
    if (pointerFrameRef.current) {
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }

    if (flush) flushPointer();

    const interaction = interactionRef.current;
    interactionRef.current = null;
    latestPointerRef.current = null;
    setInteractionActive(false);

    try {
      if (
        interaction &&
        canvasRef.current?.hasPointerCapture(interaction.pointerId)
      ) {
        canvasRef.current.releasePointerCapture(interaction.pointerId);
      }
    } catch {
      // Capture may already have been released by the browser.
    }
  }, [flushPointer]);

  const startInteraction = useCallback((interaction, event) => {
    if (
      event.button !== 0 ||
      interactionRef.current ||
      dialogRef.current
    ) {
      return;
    }

    layoutRequestRef.current += 1;
    setLayoutRunning(false);

    interactionRef.current = {
      ...interaction,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      zoom: viewportRef.current.zoom,
    };

    latestPointerRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    setInteractionActive(true);

    try {
      canvasRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners still complete the interaction if capture is unavailable.
    }
  }, [dialogRef, viewportRef]);

  useEffect(() => {
    const onMove = (event) => {
      if (event.pointerId !== interactionRef.current?.pointerId) return;

      latestPointerRef.current = { x: event.clientX, y: event.clientY };

      if (!pointerFrameRef.current) {
        pointerFrameRef.current = requestAnimationFrame(flushPointer);
      }
    };

    const onUp = (event) => {
      if (event.pointerId !== interactionRef.current?.pointerId) return;

      latestPointerRef.current = { x: event.clientX, y: event.clientY };
      finishInteraction(true);
    };

    const onCancel = (event) => {
      if (event.pointerId === interactionRef.current?.pointerId) {
        finishInteraction(false);
      }
    };

    const onBlur = () => finishInteraction(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onBlur);

      if (pointerFrameRef.current) {
        cancelAnimationFrame(pointerFrameRef.current);
      }
    };
  }, [flushPointer, finishInteraction]);

  useEffect(() => {
    if (!interactionActive) return undefined;

    const previous = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.userSelect = previous;
    };
  }, [interactionActive]);

  useEffect(() => {
    finishInteraction(false);
    setContextMenu(null);
  }, [model, state.epoch, finishInteraction]);

  const captureTableMove = useCallback((names) => {
    const current = stateRef.current;
    const positions = dictionary();
    const memberSet = new Set(names);

    for (const name of names) {
      const position = current.data.tablePositions[name];
      if (position) positions[name] = { ...position };
    }

    const lineOverrides = dictionary();

    for (const ref of refsRef.current) {
      if (
        memberSet.has(ref.from.table) &&
        memberSet.has(ref.to.table) &&
        hasOwn(current.data.lineMidXOverrides, ref.routeKey)
      ) {
        lineOverrides[ref.routeKey] =
          current.data.lineMidXOverrides[ref.routeKey];
      }
    }

    return { positions, lineOverrides };
  }, [stateRef, refsRef]);

  const moveTables = useCallback((names, dx, dy) => {
    layoutRequestRef.current += 1;
    setLayoutRunning(false);

    const captured = captureTableMove(names);
    const positions = dictionary();
    const lineOverrides = dictionary();

    for (const [name, position] of Object.entries(captured.positions)) {
      positions[name] = { x: position.x + dx, y: position.y + dy };
    }

    for (const [key, x] of Object.entries(captured.lineOverrides)) {
      lineOverrides[key] = x + dx;
    }

    dispatch({ type: "positions", positions, lineOverrides });
  }, [captureTableMove]);

  const jumpToTable = useCallback((name) => {
    const current = stateRef.current;

    if (
      !current.data.jumpToTableOnClick ||
      current.parsedSource !== current.data.dbml ||
      !editorRef.current ||
      !monacoRef.current
    ) {
      return;
    }

    const table = modelTables(current.model).find((item) => item.name === name);
    const start = table?.sourceStartLine;

    if (!Number.isInteger(start) || start < 1) return;

    const editor = editorRef.current;
    const editorModel = editor.getModel();
    if (!editorModel || start > editorModel.getLineCount()) return;

    const candidateEnd =
      table.sourceEndLine ||
      table.sourceRange?.endLineNumber ||
      start;

    const end = clamp(candidateEnd, start, editorModel.getLineCount());

    editor.revealLineInCenter(start);
    clearTimeout(glowTimerRef.current);

    glowDecorationsRef.current = editor.deltaDecorations(
      glowDecorationsRef.current,
      [{
        range: new monacoRef.current.Range(
          start,
          1,
          end,
          editorModel.getLineMaxColumn(end),
        ),
        options: {
          isWholeLine: true,
          className: "sker-editor-glow-line",
        },
      }],
    );

    glowTimerRef.current = setTimeout(() => {
      if (editorRef.current !== editor) return;

      glowDecorationsRef.current = editor.deltaDecorations(
        glowDecorationsRef.current,
        [],
      );
    }, reducedMotion ? 800 : 1600);
  }, [stateRef, reducedMotion]);

  const selectTable = useCallback((name, multi = false) => {
    const current = stateRef.current;
    const selected = new Set(multi ? current.selectedTables : []);

    if (multi && selected.has(name)) selected.delete(name);
    else selected.add(name);

    dispatch({ type: "select", names: [...selected] });
    jumpToTable(name);
  }, [stateRef, jumpToTable]);

  const handleTablePointerDown = useCallback((name, event) => {
    if (event.ctrlKey || event.metaKey) {
      selectTable(name, true);
      return;
    }

    const current = stateRef.current;
    const names = current.selectedTables.includes(name)
      ? current.selectedTables
      : [name];

    dispatch({ type: "select", names });
    jumpToTable(name);

    startInteraction({
      type: "tables",
      ...captureTableMove(names),
    }, event);
  }, [stateRef, selectTable, jumpToTable, startInteraction, captureTableMove]);

  const handleCanvasPointerDown = (event) => {
    if (event.button !== 0) return;

    event.preventDefault();
    canvasRef.current?.focus({ preventScroll: true });

    dispatch({ type: "select", names: [] });
    setContextMenu(null);

    startInteraction({
      type: "pan",
      offset: { ...viewportRef.current.offset },
    }, event);
  };

  /* ---------------------------- Color state ------------------------------ */

  const recordRecentColors = useCallback((colors, deferred = false) => {
    clearTimeout(recentTimerRef.current);
    pendingRecentRef.current = [...new Set(colors)];

    const commit = () => {
      dispatch({ type: "recent-colors", colors: pendingRecentRef.current });
      pendingRecentRef.current = [];
      recentTimerRef.current = null;
    };

    if (deferred) recentTimerRef.current = setTimeout(commit, 650);
    else commit();
  }, []);

  const applyPaletteColor = useCallback((colorValue, deferred = false) => {
    const color = normalizeColor(colorValue);
    if (!color) return;

    const current = stateRef.current;

    if (current.selectedGroup) {
      dispatch({ type: "group-color", name: current.selectedGroup, color });
      recordRecentColors([color], deferred);
      return;
    }

    const names = current.selectedTables;
    if (!names.length) return;

    const variants =
      names.length === 1 ? [color] : generateHueFamily(color, names.length);

    const colors = dictionary();
    names.forEach((name, index) => { colors[name] = variants[index]; });

    dispatch({ type: "table-colors", colors });
    recordRecentColors(variants, deferred);
  }, [stateRef, recordRecentColors]);

  const selectedGroup = groups.find((group) => group.name === state.selectedGroup);

  const selectedPaletteColor = selectedGroup
    ? data.groupColors[selectedGroup.name] ||
      normalizeColor(selectedGroup.color) ||
      GROUP_COLORS[groups.indexOf(selectedGroup) % GROUP_COLORS.length]
    : state.selectedTables.length === 1
      ? effectiveColors[state.selectedTables[0]]
      : null;

  /* ---------------------------- Context menu ----------------------------- */

  const openContextMenu = useCallback((name, event) => {
    const current = stateRef.current;
    const names = new Set(current.selectedTables);

    if (event.ctrlKey || event.metaKey) names.add(name);
    else if (!names.has(name)) {
      names.clear();
      names.add(name);
    }

    dispatch({ type: "select", names: [...names] });
    setNewGroupName(nextGroupName(modelGroups(current.model)));

    setContextMenu({
      target: name,
      names: [...names],
      x: clamp(event.clientX, 8, Math.max(8, window.innerWidth - 306)),
      y: clamp(event.clientY, 8, Math.max(8, window.innerHeight - 390)),
      epoch: current.epoch,
    });
  }, [stateRef]);

  useEffect(() => {
    if (!contextMenu) return undefined;

    const onPointer = (event) => {
      if (!contextRef.current?.contains(event.target)) setContextMenu(null);
    };

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextMenu(null);
        canvasRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const createGroup = (event) => {
    event.preventDefault();

    const current = stateRef.current;
    const name = newGroupName.trim();

    if (
      !contextMenu ||
      contextMenu.epoch !== current.epoch ||
      !name ||
      modelGroups(current.model).some((group) => group.name === name)
    ) {
      return;
    }

    if (
      current.parsedSource !== current.data.dbml ||
      current.errors.length
    ) {
      notify("Resolve DBML errors before creating a group.", "error");
      return;
    }

    const tableMap = new Map(
      modelTables(current.model).map((table) => [table.name, table]),
    );

    const members = contextMenu.names
      .map((tableName) => tableMap.get(tableName))
      .filter(Boolean);

    if (!members.length) return;

    const block = [
      `TableGroup ${formatDbmlIdentifier(name)} {`,
      ...members.map((table) => `  ${getTableDbmlPath(table, current.data.dbml)}`),
      "}",
    ].join("\n");

    const nextDbml = `${current.data.dbml.trimEnd()}\n\n${block}\n`;
    const result = parseDocument(nextDbml);

    if (!result.model || result.errors.length) {
      notify(
        result.errors[0]?.message || "The selected tables could not be grouped.",
        "error",
      );
      return;
    }

    dispatch({ type: "edit", dbml: nextDbml });
    patch({ groupsVisible: true });
    setContextMenu(null);
  };

  /* ---------------------------- Layout ----------------------------------- */

  const autoLayout = useCallback(async (mode, direction) => {
    const current = stateRef.current;

    if (
      !diagramTables.length ||
      current.parsedSource !== current.data.dbml ||
      current.errors.length ||
      interactionRef.current
    ) {
      notify("Finish the current edit or interaction before arranging.", "error");
      return;
    }

    const request = ++layoutRequestRef.current;
    const epoch = current.epoch;
    const revision = current.geometryRevision;

    setLayoutRunning(true);

    const input = {
      tables: diagramTables,
      refs,
      groups,
      tableWidths,
    };

    try {
      let positions;

      try {
        positions =
          mode === "smart"
            ? await buildSmartLayout(input)
            : buildHierarchicalLayout({ ...input, direction });
      } catch (error) {
        if (mode !== "smart") throw error;

        positions = buildHierarchicalLayout({ ...input, direction });

        if (request === layoutRequestRef.current) {
          notify("Smart layout failed; a hierarchy layout was used instead.");
        }
      }

      const latest = stateRef.current;

      if (
        !mountedRef.current ||
        request !== layoutRequestRef.current ||
        latest.epoch !== epoch ||
        latest.geometryRevision !== revision
      ) {
        return;
      }

      const validated = readRecord(positions, "layout positions", readPosition);

      for (const table of diagramTables) {
        if (!validated[table.name]) {
          throw new Error(`Layout did not provide a position for ${table.name}.`);
        }
      }

      dispatch({
        type: "layout",
        positions: validated,
        epoch,
        revision,
      });

      setFitRequest((value) => value + 1);
    } catch (error) {
      if (mountedRef.current && request === layoutRequestRef.current) {
        notify(errorMessage(error, "Unable to arrange the diagram."), "error");
      }
    } finally {
      if (mountedRef.current && request === layoutRequestRef.current) {
        setLayoutRunning(false);
      }
    }
  }, [stateRef, diagramTables, refs, groups, tableWidths, notify]);

  /* ---------------------------- Save / open ------------------------------ */

  const saveToFile = useCallback(() => {
    try {
      const current = snapshotRef.current;
      const name = current.fileName === "Untitled" ? "diagram" : current.fileName;

      const safeName = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
      const downloadName = /\.sker$/i.test(safeName)
        ? safeName
        : `${safeName}.sker`;

      const blob = new Blob(
        [JSON.stringify({ ...current, fileName: name }, null, 2)],
        { type: "application/json" },
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (current.fileName === "Untitled") patch({ fileName: "diagram" });
      flushAutosave();
      notify("Diagram file downloaded.");
    } catch (error) {
      notify(errorMessage(error, "Unable to save the diagram."), "error");
    }
  }, [snapshotRef, patch, flushAutosave, notify]);

  const loadFile = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const request = ++loadRequestRef.current;
    setLoadRunning(true);

    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error("The selected file exceeds the 10 MB size limit.");
      }

      const text = await file.text();

      if (!mountedRef.current || request !== loadRequestRef.current) return;

      const imported = normalizeDocument(JSON.parse(text), {
        requireDbml: true,
      });

      imported.fileName = file.name.replace(/\.(sker|json)$/i, "") || "diagram";

      const parsed = parseDocument(imported.dbml);

      layoutRequestRef.current += 1;
      setLayoutRunning(false);
      finishInteraction(false);

      clearTimeout(recentTimerRef.current);
      pendingRecentRef.current = [];

      dispatch({ type: "open", data: imported, parsed });
      setContextMenu(null);
      setEditingName(false);
      setNameDraft(imported.fileName);

      applyViewport(
        imported.viewport || { zoom: 1, offset: { x: 0, y: 0 } },
      );

      if (!imported.viewport) setFitRequest((value) => value + 1);

      notify(
        parsed.errors.length
          ? "File opened with DBML errors. Correct them in the editor."
          : "Diagram opened.",
        parsed.errors.length ? "error" : "info",
      );
    } catch (error) {
      if (mountedRef.current && request === loadRequestRef.current) {
        notify(errorMessage(error, "Unable to open the selected file."), "error");
      }
    } finally {
      if (mountedRef.current && request === loadRequestRef.current) {
        setLoadRunning(false);
      }
    }
  }, [finishInteraction, applyViewport, notify]);

  /* ---------------------------- Sharing ---------------------------------- */

  const createShareUrl = useCallback(() => {
    const current = snapshotRef.current;

    return buildShareUrl({
      ...current,
      version: DOCUMENT_VERSION,
    }, window.location);
  }, [snapshotRef]);

  const copyShareLink = useCallback(async (override) => {
    const request = ++copyRequestRef.current;

    clearTimeout(copyTimerRef.current);
    setCopyStatus("idle");

    try {
      const url = typeof override === "string" ? override : createShareUrl();
      await copyTextToClipboard(url);

      if (!mountedRef.current || request !== copyRequestRef.current) return;

      setCopyStatus("copied");
    } catch (error) {
      if (!mountedRef.current || request !== copyRequestRef.current) return;

      setCopyStatus("error");
      notify(errorMessage(error, "Unable to copy the shareable link."), "error");
    }

    copyTimerRef.current = setTimeout(() => {
      if (mountedRef.current && request === copyRequestRef.current) {
        setCopyStatus("idle");
      }
    }, 2500);
  }, [createShareUrl, notify]);

  const showQr = useCallback(() => {
    try {
      const url = createShareUrl();

      finishInteraction(false);
      setCopyStatus("idle");
      setDialog({ type: "qr", url });
    } catch (error) {
      notify(errorMessage(error, "Unable to create a shareable link."), "error");
    }
  }, [createShareUrl, finishInteraction, notify]);

  const closeDialog = useCallback(() => setDialog(null), []);

  /* ---------------------------- PNG export ------------------------------- */

  const exportPng = useCallback(async () => {
    if (exportRunning) return;

    const scene = sceneRef.current;
    if (!scene || !diagramTables.length) return;

    setExportRunning(true);

    try {
      await document.fonts?.ready;

      const elementMap = new Map(
        [...scene.querySelectorAll("[data-diagram-table]")].map((node) => [
          node.getAttribute("data-diagram-table"),
          node,
        ]),
      );

      const htmlNodes = [];
      const rectangles = [];

      for (const table of diagramTables) {
        const position = data.tablePositions[table.name];
        const node = elementMap.get(table.name);

        if (!position || !node) continue;

        htmlNodes.push({ node, x: position.x, y: position.y });
        rectangles.push({
          x: position.x,
          y: position.y,
          width: node.offsetWidth,
          height: node.offsetHeight,
        });
      }

      const diagramSvg = scene.querySelector("[data-diagram-svg]");

      diagramSvg?.querySelectorAll("[data-export-bounds]").forEach((element) => {
        try {
          const box = element.getBBox();

          if (box.width || box.height) {
            rectangles.push({
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
            });
          }
        } catch {
          // An unrendered SVG element contributes no export bounds.
        }
      });

      let bounds = calculateExportBounds(rectangles);

      if (!bounds || !diagramSvg || !htmlNodes.length) {
        throw new Error("The diagram contains no exportable content.");
      }

      if (data.colorLegendVisible && legendRef.current) {
        const node = legendRef.current;
        const items = node.querySelector("[data-color-legend-items]");

        const hiddenHeight = items
          ? Math.max(0, items.scrollHeight - items.clientHeight)
          : 0;

        const width = node.offsetWidth;
        const height = node.offsetHeight + hiddenHeight;

        const placement = placeRightSideExportNode(bounds, { width, height });

        htmlNodes.push({
          node,
          x: placement.x,
          y: placement.y,
          width,
          height,
          expandForExport: true,
        });

        bounds = placement.bounds;
      }

      // Conservative guard against excessive raster allocations.
      if (
        bounds.width > 16000 ||
        bounds.height > 16000 ||
        bounds.width * bounds.height > 40_000_000
      ) {
        throw new Error(
          "This diagram is too large for a safe PNG export. Reduce its spacing or collapse tables.",
        );
      }

      const png = await renderDiagramPng({
        diagramSvg,
        htmlNodes,
        bounds,
        backgroundColor: data.isDark ? "#1e1e1e" : "#f5f5f5",
      });

      if (!mountedRef.current) return;

      downloadPng(png, data.fileName);
      notify("PNG exported.");
    } catch (error) {
      if (mountedRef.current) {
        notify(errorMessage(error, "Unable to export the PNG."), "error");
      }
    } finally {
      if (mountedRef.current) setExportRunning(false);
    }
  }, [
    exportRunning,
    diagramTables,
    data.tablePositions,
    data.colorLegendVisible,
    data.isDark,
    data.fileName,
    notify,
  ]);

  /* ---------------------------- Monaco ----------------------------------- */

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const editorModel = editor?.getModel();

    if (!editorMounted || !editorModel || !monaco) return;

    if (state.parsedSource !== data.dbml) {
      monaco.editor.setModelMarkers(editorModel, "dbml", []);
      return;
    }

    monaco.editor.setModelMarkers(editorModel, "dbml", [
      ...state.errors.map((error) => ({
        ...error,
        severity: monaco.MarkerSeverity.Error,
        source: "DBML",
      })),
      ...state.warnings.map((warning) => ({
        ...warning,
        severity: monaco.MarkerSeverity.Warning,
        source: "DBML",
      })),
    ]);
  }, [
    editorMounted,
    state.errors,
    state.warnings,
    state.parsedSource,
    data.dbml,
  ]);

  /* ---------------------------- Render ----------------------------------- */

  const cssVariables = {
    "--sker-app": theme.appBg,
    "--sker-editor": theme.editorBg,
    "--sker-panel": theme.panelBg,
    "--sker-soft": theme.panelSoft,
    "--sker-border": theme.border,
    "--sker-text": theme.text,
    "--sker-secondary": theme.secondary,
    "--sker-muted": theme.muted,
    "--sker-chrome-top": `${topbarSize.height + 24}px`,
  };

  // Portaled dialogs do not inherit variables from the application root.
  const portalThemeCss = `
    .sker-dialog-backdrop {
      --sker-app: ${theme.appBg};
      --sker-editor: ${theme.editorBg};
      --sker-panel: ${theme.panelBg};
      --sker-soft: ${theme.panelSoft};
      --sker-border: ${theme.border};
      --sker-text: ${theme.text};
      --sker-secondary: ${theme.secondary};
      --sker-muted: ${theme.muted};
    }
  `;

  const gridId = `sker-grid-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const groupExists = groups.some((group) => group.name === newGroupName.trim());
  const parsingPending = state.parsedSource !== data.dbml;
  const hasPalette = state.selectedTables.length > 0 || Boolean(selectedGroup);

  const relationshipCount = new Set(
    refs.map((ref) => String(ref.id || ref.routeKey).split(":")[0]),
  ).size;

  return (
    <>
      <style>{STYLES}{portalThemeCss}</style>

      <div ref={rootRef} className="sker-root" style={cssVariables}>
        <aside
          ref={editorPanelRef}
          className="sker-editor"
          aria-label="DBML editor panel"
          aria-hidden={data.isEditorCollapsed || undefined}
          style={{
            width: data.isEditorCollapsed ? 0 : data.editorWidth,
            borderRight: data.isEditorCollapsed ? "none" : undefined,
            visibility: data.isEditorCollapsed ? "hidden" : "visible",
          }}
        >
          <header className="sker-editor-header sker-stack">
            <div className="sker-inline sker-between">
              <strong className="sker-logo">Sketch<span>ER</span></strong>

              <div className="sker-inline">
                <Popover label="Settings" trigger="Settings">
                  {() => (
                    <div className="sker-stack">
                      <ToggleSwitch
                        label="Jump to table code on selection"
                        checked={data.jumpToTableOnClick}
                        onChange={(checked) => patch({ jumpToTableOnClick: checked })}
                      />
                      <ToggleSwitch
                        label="Reverse connection flow"
                        checked={data.reverseConnectionFlow}
                        onChange={(checked) => patch({ reverseConnectionFlow: checked })}
                      />
                      <p className="sker-muted">
                        {data.reverseConnectionFlow
                          ? "First DBML endpoint → second endpoint"
                          : "Second DBML endpoint → first endpoint"}
                      </p>
                    </div>
                  )}
                </Popover>

                <ToolButton
                  label="Collapse code panel"
                  onClick={() => patch({ isEditorCollapsed: true })}
                >
                  ◀
                </ToolButton>
              </div>
            </div>

            <span className="sker-muted">Entity relationship diagrams · DBML</span>
          </header>

          {hasPalette && (
            <section className="sker-palette sker-stack" aria-label="Selection colors">
              <strong>
                {selectedGroup
                  ? `Group: ${selectedGroup.name}`
                  : state.selectedTables.length === 1
                    ? state.selectedTables[0]
                    : `${state.selectedTables.length} tables selected`}
              </strong>

              <ColorPalette
                label="Common colors"
                colors={TABLE_COLORS}
                selected={selectedPaletteColor}
                onChoose={(color) => applyPaletteColor(color)}
              />

              <div className="sker-inline">
                <ColorPicker
                  value={selectedPaletteColor || data.recentColors[0]}
                  onChange={(color) => applyPaletteColor(color, true)}
                />
                <span className="sker-muted">Custom color</span>
              </div>

              {data.recentColors.length > 0 && (
                <ColorPalette
                  label="Recent colors"
                  colors={data.recentColors}
                  selected={selectedPaletteColor}
                  onChoose={(color) => applyPaletteColor(color)}
                />
              )}

              {state.selectedTables.length > 0 && (
                <ToolButton
                  label="Remove selected table color overrides"
                  onClick={() => {
                    const colors = dictionary();
                    state.selectedTables.forEach((name) => { colors[name] = null; });
                    dispatch({ type: "table-colors", colors });
                  }}
                >
                  Use DBML/default color
                </ToolButton>
              )}
            </section>
          )}

          <div className="sker-editor-stats sker-stack">
            <div className="sker-inline">
              <span>{tables.length} tables</span>
              <span>{relationshipCount} refs</span>
              <span>{(model.enums || []).length} enums</span>
              <span>{tables.reduce((sum, table) => sum + table.columns.length, 0)} cols</span>
            </div>

            {parsingPending ? (
              <span className="sker-muted" role="status">Updating diagram…</span>
            ) : state.errors.length ? (
              <span role="status" style={{ color: "#dc2626" }}>
                {state.errors.length} DBML error(s) · showing last valid model
              </span>
            ) : state.warnings.length ? (
              <span role="status" style={{ color: "#b45309" }}>
                {state.warnings.length} warning(s)
              </span>
            ) : null}
          </div>

          <div className="sker-editor-content">
            <MonacoEditor
              height="100%"
              language="dbml"
              theme={data.isDark ? "dbml-dark" : "dbml-light"}
              value={data.dbml}
              beforeMount={configureMonaco}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                monacoRef.current = monaco;
                setEditorMounted(true);
              }}
              onChange={(value) => {
                const next = value || "";

                if (next.length > MAX_DBML_LENGTH) {
                  notify("The DBML document exceeds the supported size limit.", "error");
                  return;
                }

                layoutRequestRef.current += 1;
                setLayoutRunning(false);
                dispatch({ type: "edit", dbml: next });
              }}
              options={MONACO_OPTIONS}
            />
          </div>

          <footer className="sker-editor-footer sker-stack">
            <span className="sker-muted">
              Pinch to zoom · Scroll or drag to pan · Ctrl/Cmd-click to select
            </span>
            <div className="sker-inline sker-between">
              <span role="status" aria-live="polite">
                {saveStatus === "saved"
                  ? "Saved locally"
                  : saveStatus === "pending"
                    ? "Unsaved changes"
                    : "Autosave failed — download a backup"}
              </span>
              <a
                href="https://github.com/Puru-Singh"
                target="_blank"
                rel="noopener noreferrer"
              >
                Puru Singh
              </a>
            </div>
          </footer>
        </aside>

        {!data.isEditorCollapsed && (
          <div
            className="sker-resizer"
            role="separator"
            aria-label="Resize code panel"
            aria-orientation="vertical"
            aria-valuemin={280}
            aria-valuemax={700}
            aria-valuenow={Math.round(data.editorWidth)}
            tabIndex={0}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();

              startInteraction({
                type: "resize",
                width: data.editorWidth,
              }, event);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

              event.preventDefault();
              patch({
                editorWidth: clamp(
                  data.editorWidth + (event.key === "ArrowLeft" ? -20 : 20),
                  280,
                  700,
                ),
              });
            }}
          />
        )}

        <main
          ref={canvasRef}
          className="sker-canvas"
          tabIndex={0}
          aria-label="Diagram canvas"
          onPointerDown={handleCanvasPointerDown}
          onLostPointerCapture={() => {
            if (interactionRef.current) finishInteraction(false);
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;

            const directions = {
              ArrowLeft: [40, 0],
              ArrowRight: [-40, 0],
              ArrowUp: [0, 40],
              ArrowDown: [0, -40],
            };

            if (directions[event.key]) {
              event.preventDefault();
              const [dx, dy] = directions[event.key];

              applyViewport((current) => ({
                ...current,
                offset: {
                  x: current.offset.x + dx,
                  y: current.offset.y + dy,
                },
              }));
            } else if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              setCanvasZoom(viewportRef.current.zoom * 1.1);
            } else if (event.key === "-") {
              event.preventDefault();
              setCanvasZoom(viewportRef.current.zoom / 1.1);
            } else if (event.key.toLowerCase() === "f") {
              event.preventDefault();
              fitToCanvas();
            } else if (event.key === "0") {
              event.preventDefault();
              resetView();
            }
          }}
          style={{
            background: theme.canvasBg,
            cursor: interactionActive ? "grabbing" : "default",
          }}
        >
          <svg
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <defs>
              <pattern
                id={gridId}
                width={28 * viewport.zoom}
                height={28 * viewport.zoom}
                patternUnits="userSpaceOnUse"
                x={viewport.offset.x % (28 * viewport.zoom)}
                y={viewport.offset.y % (28 * viewport.zoom)}
              >
                <circle cx={1} cy={1} r={0.7} fill={theme.dot} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${gridId})`} />
          </svg>

          <div
            ref={topbarRef}
            className="sker-topbar"
            data-export-hide="1"
            data-canvas-wheel-ignore="1"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="sker-inline">
              {data.isEditorCollapsed && (
                <ToolButton
                  label="Expand code panel"
                  onClick={() => patch({ isEditorCollapsed: false })}
                >
                  ▶ Code
                </ToolButton>
              )}

              {editingName ? (
                <input
                  ref={nameInputRef}
                  className="sker-filename"
                  aria-label="Diagram filename"
                  value={nameDraft}
                  maxLength={500}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={() => {
                    const value = nameDraft.trim();
                    if (value) patch({ fileName: value });
                    setEditingName(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setNameDraft(data.fileName);
                      setEditingName(false);
                    }
                  }}
                />
              ) : (
                <ToolButton
                  label="Rename diagram"
                  className="sker-filename sker-truncate"
                  onClick={() => {
                    setNameDraft(data.fileName);
                    setEditingName(true);
                  }}
                >
                  {data.fileName}
                </ToolButton>
              )}
            </div>

            <div className="sker-toolbar" role="group" aria-label="Diagram tools">
              <ToolButton
                label={data.isDark ? "Switch to light mode" : "Switch to dark mode"}
                onClick={() => patch({ isDark: !data.isDark })}
              >
                {data.isDark ? "☀" : "☾"}
              </ToolButton>

              <ToolButton
                label="Zoom out"
                onClick={() => setCanvasZoom(viewportRef.current.zoom / 1.1)}
              >
                −
              </ToolButton>

              <ZoomControl zoom={viewport.zoom} onChange={setCanvasZoom} />

              <ToolButton
                label="Zoom in"
                onClick={() => setCanvasZoom(viewportRef.current.zoom * 1.1)}
              >
                +
              </ToolButton>

              <ToolButton label="Fit diagram in view" onClick={fitToCanvas}>
                Fit
              </ToolButton>

              <Popover
                label="Layout options"
                trigger={layoutRunning ? "Arranging…" : "Layout"}
                disabled={layoutRunning || !tables.length || parsingPending}
              >
                {(close) => (
                  <div className="sker-stack">
                    <ToolButton
                      label="Smart grouped layout"
                      onClick={() => {
                        close(true);
                        void autoLayout("smart", HIERARCHY_LEAVES_LEFT);
                      }}
                    >
                      Smart grouped
                    </ToolButton>

                    <ToolButton
                      label="Hierarchy layout, leaves on the left"
                      onClick={() => {
                        close(true);
                        void autoLayout("hierarchical", HIERARCHY_LEAVES_LEFT);
                      }}
                    >
                      Hierarchy: leaves → roots
                    </ToolButton>

                    <ToolButton
                      label="Hierarchy layout, roots on the left"
                      onClick={() => {
                        close(true);
                        void autoLayout("hierarchical", HIERARCHY_ROOTS_LEFT);
                      }}
                    >
                      Hierarchy: roots → leaves
                    </ToolButton>
                  </div>
                )}
              </Popover>

              <Popover label="View options" trigger="View">
                {(close) => (
                  <div className="sker-stack">
                    <ToolButton
                      label={allCollapsed ? "Expand every table" : "Collapse every table to keys"}
                      onClick={() => {
                        patch({
                          collapsedTables: allCollapsed
                            ? []
                            : tables.map((table) => table.name),
                        }, true);
                        close(true);
                      }}
                    >
                      {allCollapsed ? "Expand all tables" : "Collapse all tables"}
                    </ToolButton>

                    <ToolButton
                      label="Reset canvas view"
                      onClick={() => {
                        resetView();
                        close(true);
                      }}
                    >
                      Reset view
                    </ToolButton>
                  </div>
                )}
              </Popover>

              <ToolButton label="Save diagram file" onClick={saveToFile}>
                Save
              </ToolButton>

              <ToolButton
                label="Open diagram file"
                disabled={loadRunning}
                onClick={() => loadInputRef.current?.click()}
              >
                {loadRunning ? "Opening…" : "Open"}
              </ToolButton>

              <ToolButton
                label="Export diagram as PNG"
                disabled={exportRunning || !tables.length}
                onClick={() => void exportPng()}
              >
                {exportRunning ? "Exporting…" : "Export"}
              </ToolButton>

              <Popover
                label="Share diagram"
                trigger="Share"
                triggerRef={shareTriggerRef}
              >
                {(close) => (
                  <div className="sker-stack">
                    <ToolButton
                      label="Copy shareable link"
                      onClick={() => {
                        close(true);
                        void copyShareLink();
                      }}
                    >
                      Copy shareable link
                    </ToolButton>

                    <ToolButton
                      label="Show QR code"
                      onClick={() => {
                        close();
                        showQr();
                      }}
                    >
                      Show QR code
                    </ToolButton>
                  </div>
                )}
              </Popover>

              <ToolButton
                buttonRef={helpTriggerRef}
                label="Help and reference"
                onClick={() => {
                  finishInteraction(false);
                  setDialog({ type: "help" });
                }}
              >
                Help
              </ToolButton>
            </div>
          </div>

          {notice && (
            <div
              className={`sker-notice ${notice.kind === "error" ? "sker-notice-error" : ""}`}
              data-export-hide="1"
              data-canvas-wheel-ignore="1"
              role={notice.kind === "error" ? "alert" : "status"}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span>{notice.text}</span>
              <ToolButton label="Dismiss notification" onClick={() => setNotice(null)}>
                ×
              </ToolButton>
            </div>
          )}

          <div
            ref={sceneRef}
            data-transform-container="1"
            style={{
              position: "absolute",
              inset: 0,
              transform:
                `translate(${viewport.offset.x}px, ${viewport.offset.y}px) ` +
                `scale(${viewport.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg
              data-diagram-svg="1"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 1,
                height: 1,
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              <GroupOverlay
                groups={groups}
                visible={data.groupsVisible}
                positions={data.tablePositions}
                tablesByName={diagramTablesByName}
                widths={tableWidths}
                colors={data.groupColors}
                selectedGroup={state.selectedGroup}
                onSelect={(name) => dispatch({ type: "select-group", name })}
                onDragStart={(names, event) => {
                  startInteraction({
                    type: "tables",
                    ...captureTableMove(names),
                  }, event);
                }}
                onMove={moveTables}
              />

              <RelationshipLines
                refs={refs}
                tables={diagramTables}
                positions={data.tablePositions}
                widths={tableWidths}
                colors={effectiveColors}
                overrides={data.lineMidXOverrides}
                hoveredTable={state.hoveredTable}
                selectedTables={state.selectedTables}
                showAll={data.showAllConnections}
                reverseFlow={data.reverseConnectionFlow}
                theme={theme}
                reducedMotion={reducedMotion}
                onDragStart={(key, x, event) => {
                  startInteraction({ type: "line", key, x }, event);
                }}
                onMoveLine={(key, x) => {
                  dispatch({ type: "line", key, x });
                }}
              />
            </svg>

            {diagramTables.map((table) => {
              const position = data.tablePositions[table.name];
              if (!position) return null;

              return (
                <TableNode
                  key={data.tableIds[table.name] || table.name}
                  table={table}
                  position={position}
                  width={tableWidths[table.name] || TABLE_WIDTH}
                  color={effectiveColors[table.name]}
                  theme={theme}
                  selected={selectedSet.has(table.name)}
                  dimmed={
                    !data.showAllConnections &&
                    connectedTables !== null &&
                    !connectedTables.has(table.name)
                  }
                  relationshipColumns={relationshipColumns.get(table.name)}
                  activeColumns={activeColumns.get(table.name)}
                  onPointerDown={handleTablePointerDown}
                  onSelect={selectTable}
                  onMove={(name, dx, dy) => {
                    const names = selectedSet.has(name)
                      ? state.selectedTables
                      : [name];
                    moveTables(names, dx, dy);
                  }}
                  onContextMenu={openContextMenu}
                  onHover={(name) => dispatch({ type: "hover", name })}
                  onToggleCollapse={(name) => dispatch({ type: "collapse", name })}
                />
              );
            })}
          </div>

          <MiniMap
            tables={diagramTables}
            positions={data.tablePositions}
            widths={tableWidths}
            colors={effectiveColors}
            viewport={viewport}
            canvasSize={canvasSize}
            theme={theme}
          />

          {data.colorLegendVisible && (
            <ColorLegend
              legendRef={legendRef}
              entries={legendEntries}
              descriptions={data.colorLegendDescriptions}
              theme={theme}
              onChange={(color, description) => {
                dispatch({ type: "legend-description", color, description });
              }}
            />
          )}

          {!tables.length && (
            <div className="sker-empty">
              {state.errors.length
                ? "Correct the DBML errors to display this diagram."
                : "Write DBML in the editor to create tables."}
            </div>
          )}

          <div
            className="sker-bottom-controls"
            data-export-hide="1"
            data-canvas-wheel-ignore="1"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <ToggleSwitch
              label="Groups"
              checked={data.groupsVisible}
              onChange={(checked) => patch({ groupsVisible: checked })}
            />
            <ToggleSwitch
              label="Highlight links"
              checked={data.showAllConnections}
              onChange={(checked) => patch({ showAllConnections: checked })}
            />
            <ToggleSwitch
              label="Color legend"
              checked={data.colorLegendVisible}
              onChange={(checked) => patch({ colorLegendVisible: checked })}
            />
          </div>

          {contextMenu && (
            <form
              ref={contextRef}
              className="sker-context sker-stack"
              data-canvas-wheel-ignore="1"
              aria-label="Table options"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onSubmit={createGroup}
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <strong>{contextMenu.target}</strong>

              <ColorPalette
                label="Diagram colors"
                colors={legendEntries.map((entry) => entry.color)}
                selected={effectiveColors[contextMenu.target]}
                onChoose={(color) => {
                  dispatch({
                    type: "table-colors",
                    colors: { [contextMenu.target]: color },
                  });
                  recordRecentColors([color]);
                  setContextMenu(null);
                }}
              />

              <ColorPicker
                value={effectiveColors[contextMenu.target]}
                label="Choose a custom table color"
                onChange={(color) => {
                  dispatch({
                    type: "table-colors",
                    colors: { [contextMenu.target]: color },
                  });
                  recordRecentColors([color], true);
                }}
              />

              <hr style={{ width: "100%", border: 0, borderTop: `1px solid ${theme.border}` }} />

              <strong>Create table group</strong>
              <span className="sker-muted">
                {contextMenu.names.length} table(s) selected
              </span>

              <input
                autoFocus
                aria-label="New table group name"
                value={newGroupName}
                maxLength={500}
                onChange={(event) => setNewGroupName(event.target.value)}
                aria-invalid={groupExists || undefined}
              />

              {groupExists && (
                <span role="status" style={{ color: "#dc2626" }}>
                  A group with this name already exists.
                </span>
              )}

              <button
                type="submit"
                className="sker-button sker-primary"
                disabled={
                  !newGroupName.trim() ||
                  groupExists ||
                  parsingPending ||
                  state.errors.length > 0
                }
              >
                Create group
              </button>

              <ToolButton
                label="Close table options"
                onClick={() => {
                  setContextMenu(null);
                  canvasRef.current?.focus();
                }}
              >
                Close
              </ToolButton>
            </form>
          )}

          <input
            ref={loadInputRef}
            type="file"
            accept=".sker,.json"
            aria-label="Open diagram file"
            onChange={(event) => void loadFile(event)}
            hidden
          />

          <span className="sker-sr-only" role="status" aria-live="polite">
            {copyStatus === "copied"
              ? "Shareable link copied."
              : copyStatus === "error"
                ? "Unable to copy the shareable link."
                : ""}
          </span>
        </main>
      </div>

      {dialog?.type === "help" && (
        <HelpDialog
          onClose={closeDialog}
          restoreFocusRef={helpTriggerRef}
        />
      )}

      {dialog?.type === "qr" && (
        <ShareQrDialog
          url={dialog.url}
          fileName={data.fileName}
          copyStatus={copyStatus}
          onCopy={copyShareLink}
          onClose={closeDialog}
          restoreFocusRef={shareTriggerRef}
        />
      )}
    </>
  );
}
