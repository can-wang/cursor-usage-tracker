export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Prepend NEXT_PUBLIC_BASE_PATH to an absolute app path when it isn't already there.
 * Idempotent — safe to wrap paths that are already basepath-prefixed.
 *
 * We need this because Next.js's automatic basePath handling has known gaps:
 *  - query-only hrefs like "/?foo=bar" don't get prefixed reliably on <Link>
 *  - next/image's `url` query param isn't prefixed (optimizer can't find the asset)
 *  - metadata icons like { icon: "/favicon.png" } don't get prefixed
 */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith("/")) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
