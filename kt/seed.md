# Seed

`seed/` holds the optional initial content of the knowledge tree, versioned in git: one Markdown
file per node, in folders that mirror the tree. It is **import-only** (nothing is ever written
back to it) and **loaded once**, into an empty database. Content added afterwards lives only in
the database (`data/knowledge.db`, not versioned); `kt_snapshot` keeps copies of it.

## Format

```
seed/
  index.md                    the root
  10-architecture/
    index.md                  a node with children: a folder with an index.md
    10-storage.md             a leaf: a plain .md file
```

- The numeric prefix only orders the children. A node's **key** is its path without the prefixes
  and without `.md` (`architecture/storage`); the root's key is `/`. Keys are used by links.
- The **title comes from the front matter**, never from the file name. Each file starts with a
  YAML front matter, then the Markdown content of the node:

  ```
  ---
  title: Storage
  tags: [sqlite, storage]
  links:
    - to: architecture/access     # a key
      note: why the link exists
  ---
  The content...
  ```

  Only `title`, `tags` and `links` are allowed. Hidden files and non-`.md` files are ignored.
- The tree rules apply (see `CLAUDE.md`): too many children, content too large, bad tags, a link
  to an ancestor or to an unknown key make the seed fail, with the file named. Nothing is written
  when it fails.

## Loading

```sh
npm run seed                  # loads seed/
node scripts/seed.js <folder> # loads another folder in the same format
```

The seed loads into an **empty** database only. If the database already holds content, the script
refuses and asks for the data to be deleted by hand: it never deletes anything. To start again
from the seed, stop the web server and every Claude session using the MCP server, delete
`data/knowledge.db`, `data/knowledge.db-wal` and `data/knowledge.db-shm`, then run `npm run seed`
again. This erases everything added since the first load.

The database file can be changed with `KT_DB`; the script then names that file.

## Code

`server/seed-files.js` (`readSeed`, `loadSeed`), `scripts/seed.js`, tests in `test/seed.test.js`.
