import { access } from "node:fs/promises";
import { normalize, resolve, sep } from "node:path";

export function safePath(root, requestedPath) {
  const base = resolve(root);
  const target = resolve(base, normalize(requestedPath));
  return target === base || target.startsWith(`${base}${sep}`) ? target : null;
}

export async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
