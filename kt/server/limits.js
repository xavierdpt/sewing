// Limits of the tree, shared by the server (server/db.js) and the web UI (client/src/api.js).
// No imports here: Vite bundles this file into the UI.
export const MAX_CHILDREN = 5;
export const MIN_TAGS = 1;
export const MAX_TAGS = 10;
export const MAX_CONTENT = 8192;
