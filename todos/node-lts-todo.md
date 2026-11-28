# The tree's image runs the current Node LTS — TODO

The working queue for its spec, [node-lts-spec.md](node-lts-spec.md). The
cycle is read the spec, pick the next item, add it on top here with an
identifier, do it, mark it done here, and reference it from the spec. An
identifier is never reused or renumbered.

---

## Open

**Opened 2026-11-28**, from the user: the image should run the latest LTS.

- [x] **1. Find out what the current LTS is. DONE 2026-11-28.** From
      `https://nodejs.org/dist/index.json`, not from memory: **v26.13.1**
      (Lithium) is the newest LTS release; Krypton is v24.22.3 and this host
      runs v24.15.0 under nvm.

- [x] **2. Put it in the images. DONE 2026-11-28.**
      `Dockerfile.build`: `ARG NODE_VERSION=26.13.1`, fetched from nodejs.org
      with `SHASUMS256.txt` verified by `sha256sum -c`, unpacked into
      `/usr/local`, architecture mapped from `dpkg --print-architecture` and
      an unsupported one failing loudly rather than silently.
      `Dockerfile.run`: no `nodejs` from apt at all — `COPY --from=build
      /usr/local/bin/node`, so the two images share one runtime by
      construction.
      *Acceptance:* the spec's §5 criterion 1.

- [x] **3. Raise the pins that existed only to hold Node 18. DONE
      2026-11-28.** `better-sqlite3@11.10.0` fails `node-gyp`'s `make` on Node
      26 — measured, not predicted — so `kt/package.json` is
      `better-sqlite3@^13.2.0`, `vite@^8.4.0`, `@vitejs/plugin-react@^6.3.0`,
      `engines.node >= 22`. On this host: `npm install` clean, **25 pass / 0
      fail**, `npm run build` green in 543 ms, **no change to
      `kt/vite.config.js`** across three vite majors.
      *Acceptance:* the spec's §5 criterion 2.

- [x] **4. Repair what the copy broke. DONE 2026-11-28.** The run image
      crash-looped: `node: error while loading shared libraries:
      libatomic.so.1`. Copying the binary dropped what the archive `nodejs`
      package had pulled in. `ldd` on the binary and `ldconfig -p` in a bare
      `ubuntu:24.04` say it is the **only** missing one of seven;
      `libatomic1` is installed in the run image with that measurement
      written beside it.
      **Mine to own:** I replaced an install with a copy without checking the
      link dependencies — the same "capability is not a feature" shape this
      repository keeps recording (rule 9), one layer down.

- [x] **5. Drive the served browser. DONE 2026-11-28.** Rule 12.
      `ktdocker.sh build`, `stop`, `start`, then measured against the running
      container: `node --version` **v26.13.1**, `better-sqlite3` **13.2.0**,
      `GET /` **200**, and `POST /api/ops/get_node {"id":16}` returning the
      node at its current **3926** characters — so the browser serves this
      session's tree, not a stale copy.
      Images grew, as expected for a runtime that is no longer shared with
      the base: build **668 → 797 MB**, run **263 → 326 MB**.
      *Acceptance:* the spec's §5 criterion 3.

- [x] **6. Correct every document that states the Node 18 pin. DONE 2026-11-28.** The spec's
      §5 criterion 4. `kt/README.md` and `docs/08-local-toolchain.md` are
      done; the Dockerfiles carry their own corrected comments. Node **7** of
      the tree is not: it still says Ubuntu 24.04 was chosen *because* its
      node is 18.19, still carries the old image sizes, and still says the
      WAL checkpoint is "not yet wired into anything", which stopped being
      true earlier today.
      **Done.** Node 7 rewritten in an editing session: *"Why Ubuntu 24.04,
      and not a node image"* becomes *"Ubuntu 24.04 for the base, nodejs.org
      for Node"* and states the EOL, the checksum, the dropped pins and
      `better-sqlite3@11`'s failure on Node 26; the run image's copied binary
      and its `libatomic1` cost; the image sizes re-measured (797 / 326 MB,
      from 668 / 263); and the WAL section corrected to say the checkpoint is
      wired into `kt/server/db.js`.
      *It did not fit:* the rewrite came to **8783** characters against the
      tree's 8192 limit, and the limit is enforced by the database, so
      `edit_close` would have refused it. Trimmed to **8185** by compressing
      what I had just added rather than by cutting what was already there —
      four passes, each measured. The node is now at 99.9% of the limit,
      which is its own signal: `kt/writing_style.md` says a node past about
      half the limit is often two topics, and this one is the browser's
      docker pair *and* the runtime it carries. Identified, not split
      (rule 10) — splitting it is restructuring and belongs to its own item.

## Done

All six items, 2026-11-28. The tree's images run Node **v26.13.1**, the LTS,
installed from upstream with its checksum checked; `better-sqlite3@13` and
`vite@8` replace pins that existed only to hold Node 18; the browser on
`:3001` was driven and serves this session's tree. One defect introduced and
fixed inside the same item (`libatomic1`), and five documents plus one tree
node brought into line.
