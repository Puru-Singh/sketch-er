import {
  EMPTY_DBML_MODEL,
  parseDBMLDocument,
} from "./dbmlParser.js";
import { detectTableRenames } from "./tableIdentity.js";
import { decodeShareHash } from "./shareLink.js";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const STORAGE_KEY = "sketcher-state";
export const DOCUMENT_VERSION = 2;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DBML_LENGTH = 5 * 1024 * 1024;
export const MAX_DICTIONARY_ENTRIES = 100_000;
export const MAX_COORDINATE = 10_000_000;

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 2;

export const RELATIONSHIP_LINE_WIDTH = 1.8;

export const DEFAULT_DBML = `Table users {
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

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function dictionary(source) {
  return Object.assign(Object.create(null), source || {});
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function clampZoom(value) {
  return clamp(value, MIN_ZOOM, MAX_ZOOM);
}

export function normalizeColor(value) {
  if (typeof value !== "string") return null;

  const color = value.trim().toLowerCase();

  if (/^#[0-9a-f]{6}$/.test(color)) return color;

  if (/^#[0-9a-f]{3}$/.test(color)) {
    return `#${[...color.slice(1)].map((character) => character.repeat(2)).join("")}`;
  }

  return null;
}

export function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function stableHash(value) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/* -------------------------------------------------------------------------- */
/* Validation and serialization                                               */
/* -------------------------------------------------------------------------- */

export function readString(value, name, fallback, maxLength = MAX_DBML_LENGTH) {
  if (value === undefined) return fallback;

  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error(`${name} must be a string of at most ${maxLength} characters.`);
  }

  return value;
}

export function readBoolean(value, name, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

export function readNumber(value, name, fallback, min, max) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return clamp(value, min, max);
}

export function readRecord(value, name, validateValue) {
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

export function readCoordinate(value, name) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE) {
    throw new Error(`${name} must be a finite coordinate.`);
  }

  return value;
}

export function readPosition(value, name) {
  if (!isRecord(value)) throw new Error(`${name} must contain x and y.`);

  return {
    x: readCoordinate(value.x, `${name}.x`),
    y: readCoordinate(value.y, `${name}.y`),
  };
}

export function readColor(value, name) {
  const color = normalizeColor(value);
  if (!color) throw new Error(`${name} must be a hexadecimal color.`);
  return color;
}

export function readStringArray(value, name, fallback = []) {
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

export function normalizeDocument(raw, { requireDbml = false } = {}) {
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
    connectionLineWidth: readNumber(
      raw.connectionLineWidth,
      "connectionLineWidth",
      RELATIONSHIP_LINE_WIDTH,
      1.5,
      2.0,
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

export function parseDocument(dbml) {
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

export function modelTables(model) {
  return model?.tables || [];
}

export function modelGroups(model) {
  return model?.groups || [];
}

export function legacyRelationshipKey(ref) {
  const base =
    `rline-${ref.from.table}-${ref.from.column}` +
    `-${ref.to.table}-${ref.to.column}`;

  return ref.composite ? `${base}-${ref.id}` : base;
}

export function identifyRelationships(model, tableIds) {
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

export function reconcileDocument(data, model, previousModel, allowRenames) {
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
        x: 60 + (index % columns) * (230 + 90),
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

export function createDocumentState(data, parsed, epoch = 0) {
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

export function initializeApplication() {
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

export function documentReducer(state, action) {
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
