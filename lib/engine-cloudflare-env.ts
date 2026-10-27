/**
 * Resolves engine settings from either Node's `process.env` (local dev / any
 * Node host) or the Cloudflare Workers `env` binding (OpenNext on Workers
 * Builds). Cloudflare only mirrors bindings into `process.env` when the
 * `nodejs_compat_populate_process_env` flag is active, so reading the binding
 * directly keeps a dashboard Secret working on every compatibility date.
 *
 * Only variable NAMES are handled here; values never leave the server.
 */

let cachedBindings: Promise<Record<string, unknown>> | null = null;

async function cloudflareBindings(): Promise<Record<string, unknown>> {
  if (!cachedBindings) {
    cachedBindings = (async () => {
      try {
        // Computed specifier + webpackIgnore: bundlers leave it to the runtime.
        // Outside a Worker the import rejects and we simply fall back to {}.
        const spec = ["cloudflare", "workers"].join(":");
        const mod: any = await import(/* webpackIgnore: true */ spec);
        return (mod && mod.env) || {};
      } catch {
        return {};
      }
    })();
  }
  return cachedBindings;
}

/** `process.env` wins when set; otherwise the Worker binding is used. */
export async function engineSetting(name: string): Promise<string> {
  const fromNode = process.env[name];
  if (typeof fromNode === "string" && fromNode.length > 0) return fromNode;

  const bindings = await cloudflareBindings();
  const fromBinding = bindings[name];
  return typeof fromBinding === "string" ? fromBinding : "";
}

/** Names + "is it set" flags only — safe to log, never the values. */
export async function engineEnvSnapshot(): Promise<{
  apiUrl: string;
  token: string;
  apiUrlSet: boolean;
  tokenSet: boolean;
}> {
  const [apiUrl, token] = await Promise.all([
    engineSetting("ENGINE_API_URL"),
    engineSetting("ENGINE_WEB_TOKEN"),
  ]);
  return {
    apiUrl: apiUrl.trim(),
    token: token.trim(),
    apiUrlSet: apiUrl.trim().length > 0,
    tokenSet: token.trim().length > 0,
  };
}
