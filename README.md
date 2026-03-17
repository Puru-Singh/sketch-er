# SketchER

A local, open-source database diagram tool. Write DBML syntax to define tables and relationships, and see them rendered as an interactive ER diagram.

## Features

- **DBML Editor** — Define tables with columns, types, primary keys, and foreign key references
- **Interactive Canvas** — Drag tables, pan, and zoom to organize your schema
- **Relationship Lines** — Auto-drawn curved connections from `[ref: > table.col]` syntax
- **Color Customization** — Pick header colors per table via inline color picker or quick palette
- **Auto Layout** — One-click grid arrangement for all tables
- **Minimap** — Overview navigation in the bottom-right corner
- **Resizable Panels** — Drag the divider between editor and canvas

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## DBML Syntax

```
Table users {
  id int [pk]
  username varchar
  email varchar
  role_id int [ref: > roles.id]
}

Table roles {
  id int [pk]
  name varchar
}
```

- `[pk]` marks a primary key
- `[ref: > table.column]` creates a many-to-one relationship

## Build & Deploy

```bash
npm run build
```

### Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Framework preset auto-detects as **Vite**
4. Click **Deploy**

### Deploy to GitHub Pages

1. Run `npm run build`
2. Deploy the `dist/` folder to your `gh-pages` branch

## License

MIT
