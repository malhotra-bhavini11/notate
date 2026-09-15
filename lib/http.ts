import "server-only";

import { WorkspaceError } from "./workspace";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(hostHeader: string): string {
  // Strip the port, keeping bracketed IPv6 intact.
  return hostHeader.startsWith("[")
    ? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
    : hostHeader.split(":")[0];
}

/**
 * These routes read and write real files, so only accept requests aimed at
 * localhost (blocks DNS-rebinding) and, when the browser sends an Origin, only
 * from this app itself (blocks other open tabs from POSTing to the API).
 * Set NOTATE_ALLOW_REMOTE=1 to opt out, e.g. when reached through a tunnel.
 */
export function assertLocalRequest(request: Request): void {
  if (process.env.NOTATE_ALLOW_REMOTE === "1") return;

  const host = request.headers.get("host") ?? "";
  if (!LOCAL_HOSTNAMES.has(hostnameOf(host).toLowerCase())) {
    throw new WorkspaceError("API is only available on localhost", 403);
  }

  // Browsers send Origin on every cross-origin request; `null` (sandboxed
  // iframes, file://) fails URL parsing and is rejected along with the rest.
  const origin = request.headers.get("origin");
  if (origin !== null && originHost(origin) !== host) {
    throw new WorkspaceError("Cross-origin request rejected", 403);
  }
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof WorkspaceError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("[api]", err);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

/** Wraps a handler so guard failures and thrown WorkspaceErrors become JSON errors. */
export function withApi<Ctx>(
  handler: (request: Request, ctx: Ctx) => Promise<Response>,
): (request: Request, ctx: Ctx) => Promise<Response> {
  return async (request, ctx) => {
    try {
      assertLocalRequest(request);
      return await handler(request, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
