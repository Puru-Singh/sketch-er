import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDocument,
  reconcileDocument,
  initializeApplication,
  documentReducer,
} from "../src/sketcherDocument.js";
import { parseDBMLDocument } from "../src/dbmlParser.js";

test("normalizeDocument validates structure and supplies defaults", () => {
  const defaultDoc = normalizeDocument({});
  assert.equal(defaultDoc.version, 2);
  assert.ok(typeof defaultDoc.dbml === "string" && defaultDoc.dbml.length > 0);
  assert.equal(defaultDoc.fileName, "Untitled");
  assert.equal(defaultDoc.isDark, false);
  assert.equal(defaultDoc.editorWidth, 470);
  assert.equal(defaultDoc.viewport, null);

  assert.throws(() => normalizeDocument(null), /must be a JSON object/);
  assert.throws(() => normalizeDocument("invalid"), /must be a JSON object/);
  assert.throws(
    () => normalizeDocument({ version: 99 }),
    /unsupported file version/,
  );
  assert.throws(
    () => normalizeDocument({}, { requireDbml: true }),
    /contain a DBML document/,
  );
});

test("normalizeDocument normalizes viewport, recent colors, and editor bounds", () => {
  const doc = normalizeDocument({
    fileName: "My Diagram",
    editorWidth: 1000,
    viewport: { zoom: 5, offset: { x: 100, y: -50 } },
    recentColors: ["#ff0000", "#ff0000", "#00ff00"],
    isDark: true,
  });

  assert.equal(doc.fileName, "My Diagram");
  assert.equal(doc.editorWidth, 700);
  assert.equal(doc.viewport.zoom, 2);
  assert.deepEqual(doc.viewport.offset, { x: 100, y: -50 });
  assert.deepEqual(doc.recentColors, ["#ff0000", "#00ff00"]);
  assert.equal(doc.isDark, true);

  assert.throws(
    () => normalizeDocument({ recentColors: ["invalid-color"] }),
    /recentColors must be a hexadecimal color/,
  );
});

test("reconcileDocument assigns unique table IDs and places tables", () => {
  const rawData = normalizeDocument({
    dbml: "Table users { id int }\nTable posts { id int }",
  });
  const parsed = parseDBMLDocument(rawData.dbml);
  const result = reconcileDocument(rawData, parsed.model, null, false);

  assert.ok(result.data.tableIds.users);
  assert.ok(result.data.tableIds.posts);
  assert.notEqual(result.data.tableIds.users, result.data.tableIds.posts);

  assert.ok(result.data.tablePositions.users);
  assert.ok(result.data.tablePositions.posts);
  assert.equal(result.validNames.has("users"), true);
  assert.equal(result.validNames.has("posts"), true);
});

test("reconcileDocument handles table renames and preserves custom positions", () => {
  const oldDbml = "Table old_users { id int }";
  const newDbml = "Table new_users { id int }";

  const oldParsed = parseDBMLDocument(oldDbml);
  const newParsed = parseDBMLDocument(newDbml);

  const initialData = normalizeDocument({
    dbml: oldDbml,
    tablePositions: { old_users: { x: 300, y: 400 } },
    tableColors: { old_users: "#ef4444" },
  });

  const oldReconciled = reconcileDocument(initialData, oldParsed.model, null, false);
  const result = reconcileDocument(oldReconciled.data, newParsed.model, oldParsed.model, true);

  assert.equal(result.renames.get("old_users"), "new_users");
  assert.deepEqual(result.data.tablePositions.new_users, { x: 300, y: 400 });
  assert.equal(result.data.tableColors.new_users, "#ef4444");
});

test("initializeApplication creates default application state", () => {
  const state = initializeApplication();
  assert.ok(state.data);
  assert.ok(state.model);
  assert.equal(state.epoch, 0);
  assert.equal(state.geometryRevision, 0);
  assert.deepEqual(state.selectedTables, []);
  assert.equal(state.selectedGroup, null);
  assert.equal(state.hoveredTable, null);
});

test("documentReducer handles 'edit' action", () => {
  const initialState = initializeApplication();
  const nextState = documentReducer(initialState, {
    type: "edit",
    dbml: "Table test { id int }",
  });

  assert.equal(nextState.data.dbml, "Table test { id int }");
  assert.equal(nextState.geometryRevision, initialState.geometryRevision + 1);
});

test("documentReducer handles 'parsed' action with model updates", () => {
  const initialState = initializeApplication();
  const newDbml = "Table users { id int }\nTable posts { user_id int }";
  const parsed = parseDBMLDocument(newDbml);

  const editedState = documentReducer(initialState, {
    type: "edit",
    dbml: newDbml,
  });

  const parsedState = documentReducer(editedState, {
    type: "parsed",
    source: newDbml,
    epoch: editedState.epoch,
    result: {
      model: parsed.model,
      errors: [],
      warnings: [],
    },
  });

  assert.equal(parsedState.parsedSource, newDbml);
  assert.equal(parsedState.model, parsed.model);
  assert.ok(parsedState.data.tablePositions.users);
  assert.ok(parsedState.data.tablePositions.posts);
  assert.equal(parsedState.geometryRevision, editedState.geometryRevision + 1);
});

test("documentReducer skips stale 'parsed' actions", () => {
  const initialState = initializeApplication();
  const staleState = documentReducer(initialState, {
    type: "parsed",
    source: "stale dbml",
    epoch: 99,
    result: { model: null, errors: [], warnings: [] },
  });

  assert.equal(staleState, initialState);
});

test("documentReducer handles 'positions' action with clamping", () => {
  const initialState = initializeApplication();
  const stateWithTable = documentReducer(initialState, {
    type: "parsed",
    source: initialState.data.dbml,
    epoch: initialState.epoch,
    result: parseDBMLDocument(initialState.data.dbml),
  });

  const nextState = documentReducer(stateWithTable, {
    type: "positions",
    positions: {
      users: { x: 150, y: 250 },
    },
    lineOverrides: {
      "ref-1": 400,
    },
  });

  assert.deepEqual(nextState.data.tablePositions.users, { x: 150, y: 250 });
  assert.equal(nextState.data.lineMidXOverrides["ref-1"], 400);
  assert.equal(nextState.geometryRevision, stateWithTable.geometryRevision + 1);
});

test("documentReducer handles 'layout' action when epoch and revision match", () => {
  const initialState = initializeApplication();
  const stateWithTable = documentReducer(initialState, {
    type: "parsed",
    source: initialState.data.dbml,
    epoch: initialState.epoch,
    result: parseDBMLDocument(initialState.data.dbml),
  });

  const nextState = documentReducer(stateWithTable, {
    type: "layout",
    epoch: stateWithTable.epoch,
    revision: stateWithTable.geometryRevision,
    positions: { users: { x: 50, y: 50 } },
  });

  assert.deepEqual(nextState.data.tablePositions.users, { x: 50, y: 50 });
  assert.deepEqual(nextState.data.lineMidXOverrides, Object.create(null));
});

test("documentReducer rejects stale 'layout' action", () => {
  const initialState = initializeApplication();
  const nextState = documentReducer(initialState, {
    type: "layout",
    epoch: 999,
    revision: 999,
    positions: { users: { x: 500, y: 500 } },
  });

  assert.equal(nextState, initialState);
});

test("documentReducer handles selection, hover, and collapse toggling", () => {
  let state = initializeApplication();

  state = documentReducer(state, { type: "select", names: ["users"] });
  assert.deepEqual(state.selectedTables, ["users"]);
  assert.equal(state.selectedGroup, null);

  state = documentReducer(state, { type: "select-group", name: "Auth" });
  assert.deepEqual(state.selectedTables, []);
  assert.equal(state.selectedGroup, "Auth");

  state = documentReducer(state, { type: "hover", name: "posts" });
  assert.equal(state.hoveredTable, "posts");

  state = documentReducer(state, { type: "collapse", name: "users" });
  assert.deepEqual(state.data.collapsedTables, ["users"]);

  state = documentReducer(state, { type: "collapse", name: "users" });
  assert.deepEqual(state.data.collapsedTables, []);
});

test("documentReducer handles table and group color updates", () => {
  let state = initializeApplication();

  state = documentReducer(state, {
    type: "table-colors",
    colors: { users: "#3b82f6" },
  });
  assert.equal(state.data.tableColors.users, "#3b82f6");

  state = documentReducer(state, {
    type: "table-colors",
    colors: { users: null },
  });
  assert.equal(state.data.tableColors.users, undefined);

  state = documentReducer(state, {
    type: "group-color",
    name: "Auth",
    color: "#8b5cf6",
  });
  assert.equal(state.data.groupColors.Auth, "#8b5cf6");
});

test("documentReducer handles recent colors and legend descriptions", () => {
  let state = initializeApplication();

  state = documentReducer(state, {
    type: "recent-colors",
    colors: ["#3b82f6", "#ef4444"],
  });
  assert.deepEqual(state.data.recentColors, ["#3b82f6", "#ef4444"]);

  state = documentReducer(state, {
    type: "legend-description",
    color: "#3b82f6",
    description: "User authentication tables",
  });
  assert.equal(
    state.data.colorLegendDescriptions["#3b82f6"],
    "User authentication tables",
  );

  state = documentReducer(state, {
    type: "legend-description",
    color: "#3b82f6",
    description: "",
  });
  assert.equal(state.data.colorLegendDescriptions["#3b82f6"], undefined);
});

test("documentReducer handles 'open' and 'patch' actions", () => {
  let state = initializeApplication();

  const newDoc = normalizeDocument({ dbml: "Table products { id int }" });
  const parsed = parseDBMLDocument(newDoc.dbml);

  state = documentReducer(state, {
    type: "open",
    data: newDoc,
    parsed,
  });

  assert.equal(state.epoch, 1);
  assert.equal(state.data.dbml, "Table products { id int }");

  state = documentReducer(state, {
    type: "patch",
    patch: { isDark: true },
    geometry: false,
  });

  assert.equal(state.data.isDark, true);
});
