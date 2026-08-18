import test from "node:test";
import assert from "node:assert/strict";
import { parseDBMLDocument } from "../src/dbmlParser.js";

const FULL_DBML = `Project commerce {
  database_type: 'PostgreSQL'
  Note: '''
    Full DBML fixture
  '''
}

TablePartial timestamps {
  created_at timestamp [not null, default: \`now()\`]
  updated_at "timestamp with time zone"
}

Enum core.user_role {
  admin [note: 'Administrator']
  member
}

Table core.users as U [headercolor: #3498DB, owner: "identity"] {
  ~timestamps
  id bigint [pk, increment]
  role core.user_role [not null, default: 'member', note: 'Access role']
  balance decimal(10, 2) [check: \`balance >= 0\`]

  indexes {
    (id, role) [unique, name: 'users_role_idx']
  }

  checks {
    \`balance >= 0\` [name: 'positive_balance']
  }
}

Table posts {
  id bigint [pk]
  author_id bigint [ref: > core.users.id]
  reviewer_id bigint
}

Ref reviewer: posts.reviewer_id >? U.id [delete: set null, update: cascade, color: #ff0000, inactive]

TableGroup identity [color: #00ff00, note: 'Identity domain'] {
  core.users
  posts
}

Note reminder [color: #ffff00] {
  'Review access rules'
}

DiagramView overview {
  Tables { * }
  Notes { * }
  TableGroups { * }
  Schemas { * }
}`;

test("normalizes official DBML v2 constructs for the canvas", () => {
  const result = parseDBMLDocument(FULL_DBML);
  assert.deepEqual(result.errors, []);
  assert.ok(result.model);
  assert.equal(result.model.tables.length, 2);
  assert.equal(result.model.enums.length, 1);
  assert.equal(result.model.groups[0].color, "#00ff00");
  assert.equal(result.model.notes.length, 1);
  assert.equal(result.model.diagramViews.length, 1);

  const users = result.model.tables.find((table) => table.name === "core.users");
  assert.equal(users.alias, "U");
  assert.equal(users.headerColor, "#3498DB");
  assert.ok(users.columns.some((column) => column.name === "created_at"));
  assert.equal(users.columns.find((column) => column.name === "role").enumId, "core.user_role");
  assert.equal(users.columns.find((column) => column.name === "balance").type, "decimal(10,2)");

  assert.equal(result.model.refs.length, 2);
  const optional = result.model.refs.find((ref) => ref.name === "reviewer");
  assert.equal(optional.color, "#ff0000");
  assert.equal(optional.inactive, true);
  assert.equal(optional.onDelete, "set null");
  assert.ok([optional.from.cardinality, optional.to.cardinality].includes("0..1"));
});

test("returns source diagnostics instead of a partial model", () => {
  const result = parseDBMLDocument("Table users {\n id int [pk\n}");
  assert.equal(result.model, null);
  assert.ok(result.errors.length > 0);
  assert.equal(result.errors[0].startLineNumber, 3);
  assert.ok(result.errors[0].message.length > 0);
});

test("expands composite relationships into column-aware canvas links", () => {
  const result = parseDBMLDocument(`Table merchants {
    id int
    country_code varchar
    indexes { (id, country_code) [pk] }
  }
  Table merchant_periods {
    merchant_id int
    country_code varchar
  }
  Ref: merchant_periods.(merchant_id, country_code) > merchants.(id, country_code)`);

  assert.deepEqual(result.errors, []);
  assert.equal(result.model.refs.length, 2);
  assert.ok(result.model.refs.every((ref) => ref.composite));
  assert.deepEqual(result.model.refs.map((ref) => ref.from.column), ["merchant_id", "country_code"]);
});

test("materializes fields and inline references injected by table partials", () => {
  const result = parseDBMLDocument(`Table users {
    id int [pk]
  }
  TablePartial owned {
    user_id int [ref: > users.id]
  }
  Table posts {
    ~owned
    id int [pk]
  }`);

  assert.deepEqual(result.errors, []);
  assert.ok(result.model.tables.find((table) => table.name === "posts")
    .columns.some((column) => column.name === "user_id"));
  assert.equal(result.model.refs.length, 1);
  assert.equal(result.model.refs[0].from.table, "posts");
  assert.equal(result.model.refs[0].from.cardinality, "*");
});
