const ABSOLUTE_URL = /^https?:\/\//i;

export function resolvePublicPath(path) {
  if (!path) {
    return path;
  }

  if (ABSOLUTE_URL.test(path) || path.startsWith("data:")) {
    return path;
  }

  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}
