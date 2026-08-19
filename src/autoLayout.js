const DEFAULT_TABLE_WIDTH = 230;
const HEADER_HEIGHT = 42;
const COLUMN_HEIGHT = 32;
const TABLE_META_HEIGHT = 24;

export const HIERARCHY_LEAVES_LEFT = "leaves-left";
export const HIERARCHY_ROOTS_LEFT = "roots-left";

function hasTableMeta(table) {
  return Boolean(table.note || table.indexes?.length || table.checks?.length || table.records?.length);
}

function tableHeight(table) {
  return HEADER_HEIGHT + table.columns.length * COLUMN_HEIGHT + (hasTableMeta(table) ? TABLE_META_HEIGHT : 0);
}

function endpointScore(endpoint, tableByName) {
  const table = tableByName.get(endpoint.table);
  const column = table?.columns.find((candidate) => candidate.name === endpoint.column);
  let score = 0;
  if (column?.isPk) score += 8;
  if (column?.isUnique) score += 3;
  if (endpoint.cardinality === "1") score += 2;
  if (endpoint.cardinality === "0..1") score += 1;
  if (endpoint.cardinality === "*" || endpoint.cardinality === "0..*") score -= 2;
  if (endpoint.column === "id") score += 0.5;
  if (endpoint.column?.endsWith("_id")) score -= 0.25;
  return score;
}

// Returns the dependency direction used by layout: child/leaf -> parent/root.
// PK/unique metadata wins, then DBML cardinality, with source order as the
// deterministic fallback for ambiguous one-to-one relationships.
export function inferLineage(ref, tableByName) {
  const fromScore = endpointScore(ref.from, tableByName);
  const toScore = endpointScore(ref.to, tableByName);
  return fromScore > toScore
    ? { child: ref.to.table, parent: ref.from.table }
    : { child: ref.from.table, parent: ref.to.table };
}

function lineageEdges(tables, refs) {
  const tableByName = new Map(tables.map((table) => [table.name, table]));
  const knownTables = new Set(tableByName.keys());
  const seen = new Set();
  const edges = [];
  for (const ref of refs) {
    const { child, parent } = inferLineage(ref, tableByName);
    if (child === parent || !knownTables.has(child) || !knownTables.has(parent)) continue;
    const key = `${child}\u0000${parent}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ child, parent });
  }
  return edges;
}

function stronglyConnectedComponents(names, parentSets) {
  let nextIndex = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const lowLinks = new Map();
  const components = [];

  const visit = (name) => {
    indices.set(name, nextIndex);
    lowLinks.set(name, nextIndex);
    nextIndex += 1;
    stack.push(name);
    onStack.add(name);

    for (const parent of parentSets.get(name) || []) {
      if (!indices.has(parent)) {
        visit(parent);
        lowLinks.set(name, Math.min(lowLinks.get(name), lowLinks.get(parent)));
      } else if (onStack.has(parent)) {
        lowLinks.set(name, Math.min(lowLinks.get(name), indices.get(parent)));
      }
    }

    if (lowLinks.get(name) !== indices.get(name)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== name);
    components.push(component);
  };

  names.forEach((name) => {
    if (!indices.has(name)) visit(name);
  });
  return components;
}

function hierarchyRanks(tables, edges) {
  const names = tables.map((table) => table.name);
  const parentSets = new Map(names.map((name) => [name, new Set()]));
  edges.forEach(({ child, parent }) => parentSets.get(child)?.add(parent));

  const components = stronglyConnectedComponents(names, parentSets);
  const componentByTable = new Map();
  components.forEach((members, componentIndex) => {
    members.forEach((name) => componentByTable.set(name, componentIndex));
  });

  const componentParents = components.map(() => new Set());
  const indegrees = components.map(() => 0);
  edges.forEach(({ child, parent }) => {
    const childComponent = componentByTable.get(child);
    const parentComponent = componentByTable.get(parent);
    if (childComponent === parentComponent || componentParents[childComponent].has(parentComponent)) return;
    componentParents[childComponent].add(parentComponent);
    indegrees[parentComponent] += 1;
  });

  const ranks = components.map(() => 0);
  const queue = indegrees.map((value, index) => value === 0 ? index : -1).filter((index) => index !== -1);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const childComponent = queue[cursor];
    for (const parentComponent of componentParents[childComponent]) {
      ranks[parentComponent] = Math.max(ranks[parentComponent], ranks[childComponent] + 1);
      indegrees[parentComponent] -= 1;
      if (indegrees[parentComponent] === 0) queue.push(parentComponent);
    }
  }

  return new Map(names.map((name) => [name, ranks[componentByTable.get(name)]]));
}

function orderHierarchyColumns(tables, edges, rankByName) {
  const maxRank = Math.max(0, ...rankByName.values());
  const sourceOrder = new Map(tables.map((table, index) => [table.name, index]));
  const columns = Array.from({ length: maxRank + 1 }, () => []);
  tables.forEach((table) => columns[rankByName.get(table.name)].push(table.name));
  columns.forEach((column) => column.sort((a, b) => sourceOrder.get(a) - sourceOrder.get(b)));

  const parents = new Map(tables.map((table) => [table.name, new Set()]));
  const children = new Map(tables.map((table) => [table.name, new Set()]));
  edges.forEach(({ child, parent }) => {
    parents.get(child)?.add(parent);
    children.get(parent)?.add(child);
  });

  const order = new Map();
  const refreshOrder = () => columns.forEach((column) => column.forEach((name, index) => order.set(name, index)));
  const barycenter = (name, neighbors) => {
    const positions = [...neighbors].map((neighbor) => order.get(neighbor)).filter(Number.isFinite);
    return positions.length ? positions.reduce((sum, value) => sum + value, 0) / positions.length : null;
  };
  const sortColumn = (column, neighborMap) => {
    column.sort((a, b) => {
      const aCenter = barycenter(a, neighborMap.get(a) || []);
      const bCenter = barycenter(b, neighborMap.get(b) || []);
      if (aCenter == null && bCenter == null) return sourceOrder.get(a) - sourceOrder.get(b);
      if (aCenter == null) return 1;
      if (bCenter == null) return -1;
      return aCenter - bCenter || sourceOrder.get(a) - sourceOrder.get(b);
    });
  };

  for (let pass = 0; pass < 4; pass += 1) {
    refreshOrder();
    for (let rank = 1; rank <= maxRank; rank += 1) {
      sortColumn(columns[rank], children);
      refreshOrder();
    }
    for (let rank = maxRank - 1; rank >= 0; rank -= 1) {
      sortColumn(columns[rank], parents);
      refreshOrder();
    }
  }
  return columns;
}

export function buildHierarchicalLayout({
  tables,
  refs,
  tableWidths,
  direction = HIERARCHY_LEAVES_LEFT,
  startX = 60,
  startY = 60,
}) {
  if (!tables.length) return {};
  const edges = lineageEdges(tables, refs);
  const rankByName = hierarchyRanks(tables, edges);
  const columns = orderHierarchyColumns(tables, edges, rankByName);
  const tableByName = new Map(tables.map((table) => [table.name, table]));
  const columnGap = 140;
  const rowGap = 58;
  const displayColumns = direction === HIERARCHY_ROOTS_LEFT ? [...columns].reverse() : columns;
  const columnWidths = displayColumns.map((column) => Math.max(
    DEFAULT_TABLE_WIDTH,
    ...column.map((name) => tableWidths[name] || DEFAULT_TABLE_WIDTH),
  ));
  const columnHeights = displayColumns.map((column) => column.reduce((height, name, index) =>
    height + tableHeight(tableByName.get(name)) + (index ? rowGap : 0), 0));
  const maxColumnHeight = Math.max(...columnHeights);

  const columnX = [];
  columnWidths.forEach((width, index) => {
    columnX[index] = index === 0 ? startX : columnX[index - 1] + columnWidths[index - 1] + columnGap;
  });

  const positions = {};
  displayColumns.forEach((column, columnIndex) => {
    let y = startY + (maxColumnHeight - columnHeights[columnIndex]) / 2;
    column.forEach((name) => {
      const width = tableWidths[name] || DEFAULT_TABLE_WIDTH;
      positions[name] = {
        x: Math.round(columnX[columnIndex] + (columnWidths[columnIndex] - width) / 2),
        y: Math.round(y),
      };
      y += tableHeight(tableByName.get(name)) + rowGap;
    });
  });
  return positions;
}

export async function buildSmartLayout({ tables, refs, groups, tableWidths }) {
  if (!tables.length) return {};
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  const tableIdByName = new Map(tables.map((table, index) => [table.name, `table-${index}`]));
  const tableNameById = new Map([...tableIdByName].map(([name, id]) => [id, name]));
  const assignedTables = new Set();

  const tableNode = (table) => ({
    id: tableIdByName.get(table.name),
    width: tableWidths[table.name] || DEFAULT_TABLE_WIDTH,
    height: tableHeight(table),
  });

  const groupNodes = [];
  groups.forEach((group, groupIndex) => {
    const members = group.tables
      .filter((name) => tableIdByName.has(name) && !assignedTables.has(name))
      .map((name) => {
        assignedTables.add(name);
        return tableNode(tables.find((table) => table.name === name));
      });
    if (!members.length) return;
    groupNodes.push({
      id: `group-${groupIndex}`,
      children: members,
      layoutOptions: {
        "elk.padding": "[top=54,left=28,bottom=28,right=28]",
        "elk.spacing.nodeNode": "72",
      },
    });
  });

  const ungroupedNodes = tables.filter((table) => !assignedTables.has(table.name)).map(tableNode);
  const edges = lineageEdges(tables, refs).map(({ child, parent }, index) => ({
    id: `edge-${index}`,
    sources: [tableIdByName.get(child)],
    targets: [tableIdByName.get(parent)],
  }));

  const graph = {
    id: "root",
    children: [...groupNodes, ...ungroupedNodes],
    edges,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "86",
      "elk.layered.spacing.nodeNodeBetweenLayers": "145",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.separateConnectedComponents": "true",
      "elk.componentCompaction.strategy": "POLYOMINO",
      "elk.padding": "[top=30,left=30,bottom=30,right=30]",
      "elk.randomSeed": "1",
    },
  };

  const result = await elk.layout(graph);
  const rawPositions = {};
  const collect = (node, parentX = 0, parentY = 0) => {
    const x = parentX + (node.x || 0);
    const y = parentY + (node.y || 0);
    const tableName = tableNameById.get(node.id);
    if (tableName) rawPositions[tableName] = { x, y };
    (node.children || []).forEach((child) => collect(child, x, y));
  };
  (result.children || []).forEach((child) => collect(child));

  const values = Object.values(rawPositions);
  const minX = Math.min(...values.map((position) => position.x));
  const minY = Math.min(...values.map((position) => position.y));
  return Object.fromEntries(Object.entries(rawPositions).map(([name, position]) => [name, {
    x: Math.round(position.x - minX + 60),
    y: Math.round(position.y - minY + 60),
  }]));
}
