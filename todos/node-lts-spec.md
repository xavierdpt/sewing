# The tree's image runs the current Node LTS — SPEC

Paired with [node-lts-todo.md](node-lts-todo.md) (rule 11).

## 0. The premise

**From the user, 2026-11-28:** *"You're supposed to know which node version to
use, usually it should be the latest LTS version."*

Said after I reported an `EBADENGINE` warning from the tree's docker build as
a thing to note rather than a thing to fix.

## 1. What was wrong

`docker/knowledge-tree/Dockerfile.build` and `.run` took node from the Ubuntu
24.04 archive — **18.19**, which reached end of life in April 2025 — and the
repository had written that down as a virtue: *"the distribution's own
package is the version the project wants, with no node version manager and no
third-party apt repository"* (`Dockerfile.build`, and node 7 of the tree).

The argument is inverted. `kt/package.json` pinned `better-sqlite3@11` and
`vite@5` **to stay on Node 18**, and `kt/README.md` instructed the next reader
to keep them there. So two dependencies were being held back to preserve an
unsupported runtime, and nodejs.org — the project's own release — was being
treated as a "third party" while an EOL distro package was treated as
trustworthy.

## 2. What the measurements said

- **The current LTS is v26.13.1** (Lithium), read from
  `https://nodejs.org/dist/index.json` on 2026-11-28, not from memory. Node 24
  (Krypton, v24.22.3) is the previous line; this host runs v24.15.0 under nvm.
- **`better-sqlite3@11.10.0` does not compile on Node 26.** `node-gyp` fails
  in `make`; the build stops. That is the pin's own purpose arriving as its
  refutation.
- **The raised versions are green**, on this host and in the image:
  `better-sqlite3@13.2.0` (engines `>=22`), `vite@8.4.0` (engines `^20.19.0 ||
  >=22.12.0`), `@vitejs/plugin-react@6.3.0` (peer `vite@^8`). Three vite
  majors with **no change to `kt/vite.config.js`**, which was checked by
  building, not assumed.
- **The host's own toolchain had drifted from its document too.**
  `docs/08-local-toolchain.md` said "node v18.19.1, `npm` **not** installed";
  measured, it is **v24.15.0** and **npm 11.12.1** from `~/.nvm`, with apt's
  18.19.1 still installed and no longer what runs.

## 3. The resolved questions

1. **Where does node come from, if not the distro?** From nodejs.org, pinned
   as `ARG NODE_VERSION`, verified against its own `SHASUMS256.txt`, unpacked
   into `/usr/local`. Upstream's own release is not a third-party repository;
   the checksum is what makes that statement checkable rather than trusting.
2. **Does the run image install node too?** No — it copies the single binary
   out of the build image, so the two cannot drift onto different runtimes and
   the run image's "no npm" is finally literal.
3. **What does that copy cost?** `libatomic1`, which the archive `nodejs`
   package used to pull in. See §4; it is the one thing in this change that
   broke something.
4. **Is the host's node changed?** No. The host is the user's machine, not
   the project's; `engines` is `>=22` and the host's 24.15.0 satisfies it.

## 4. The defect this change introduced, and how it was found

The first run image crash-looped with `node: error while loading shared
libraries: libatomic.so.1`. Copying the binary rather than installing the
package dropped a dependency the package had carried.

Found by reading the container's logs, then fixed by measurement rather than
by trial: `ldd` on the upstream binary names seven libraries, and `ldconfig
-p` inside a bare `ubuntu:24.04` shows **libatomic.so.1 is the only one
missing** — `libstdc++`, `libgcc_s`, `libm`, `libc`, `libdl` and `libpthread`
are all present. `libatomic1` is installed in the run image, with that reason
written beside it.

## 5. Acceptance

1. The build image installs the pinned LTS from upstream with its checksum
   checked, and `node --version` inside the running container reports it.
2. `kt`'s suite passes **in the build image**, where the gate already runs,
   and on this host.
3. The browser serves the current tree on `:3001` — driven, not assumed
   (rule 12).
4. Every document that stated the Node 18 pin is corrected in the same turn
   (rule 10): `kt/README.md`, `docs/08-local-toolchain.md`, the two
   Dockerfiles' own comments, and node 7 of the knowledge tree.

**All four met, 2026-11-28**, by [node-lts-todo.md](node-lts-todo.md) items
1-6: criterion 1 with `node --version` reporting **v26.13.1** inside the
running container, criterion 2 at **25 pass / 0 fail** in the build image and
on this host, criterion 3 by driving `:3001` (`GET /` 200, `POST
/api/ops/get_node` returning this session's content, `better-sqlite3` 13.2.0),
criterion 4 across `kt/README.md`, `docs/08-local-toolchain.md`, both
Dockerfiles and tree node 7.
