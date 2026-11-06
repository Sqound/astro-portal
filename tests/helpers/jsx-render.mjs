import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * Lets a test import the web components built under any workspace's
 * `dist/components` (`packages/portal`, `packages/planner`, and the other
 * workspaces), and the Next page matched below, and render them with
 * `react-dom/server`: the built files keep their JSX (Next compiles them), so
 * Node cannot read them as they are. A load hook turns the JSX of those files
 * into plain calls with the compiler Next already ships (nothing added);
 * the router of `next/navigation` is a stand-in (its `redirect` throws the
 * address, as Next's does); every other module loads
 * untouched. Await it before the first dynamic
 * `import()` of a component.
 */
const COMPONENTS =
  /^(?!.*node_modules).*[\\/]dist[\\/](?:projects[\\/])?components[\\/].+\.js$|[\\/]src[\\/]app[\\/]\[locale\][\\/](?:.+[\\/])?page\.js$/;

// The router of a page that is rendered outside Next: components ask for it,
// only effects (which a static render never runs) use it. `usePathname` says
// `globalThis.__renderedPathname` (a test sets it before a render and clears it
// after), else nothing, as a page rendered outside Next has no address.
const ROUTER = `data:text/javascript,${encodeURIComponent(
  "export const useRouter = () => ({ refresh() {}, push() {}, replace() {} }); export const usePathname = () => globalThis.__renderedPathname ?? null; export const useSearchParams = () => new URLSearchParams(); export const redirect = (url) => { throw Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;' + url + ';307;', url }); };",
)}`;

let registered = false;
export async function registerJsx() {
  if (registered) return;
  registered = true;
  const swc = createRequire(import.meta.url)("next/dist/build/swc");
  await swc.loadBindings();
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "next/navigation")
        return { url: ROUTER, shortCircuit: true };
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (!url.startsWith("file:") || !COMPONENTS.test(fileURLToPath(url)))
        return nextLoad(url, context);
      const { code } = swc.transformSync(
        readFileSync(fileURLToPath(url), "utf8"),
        {
          filename: fileURLToPath(url).replace(/\.js$/, ".jsx"),
          jsc: {
            parser: { syntax: "ecmascript", jsx: true },
            transform: { react: { runtime: "automatic" } },
            target: "es2022",
          },
          module: { type: "es6" },
        },
      );
      return { format: "module", source: code, shortCircuit: true };
    },
  });
}
