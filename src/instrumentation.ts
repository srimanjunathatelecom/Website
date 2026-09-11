/**
 * Next.js instrumentation.
 *
 * `onRequestError` is the framework's own hook for unhandled errors in server
 * components, route handlers and middleware — the failures no catch block in this
 * codebase will ever see, because they escaped before reaching one. Wiring it
 * means a 500 that isn't handled anywhere still produces a structured report
 * instead of a bare stack trace in the host's log tail.
 *
 * `register` is where a vendor SDK would initialise (Sentry.init and friends).
 * Left as a documented seam rather than a stub, since there's nothing to
 * initialise for stderr-and-webhook reporting.
 */

import { reportError } from "@/lib/observability";

type RequestInfo = { path?: string; method?: string };
type ErrorContext = { routeType?: string; routerKind?: string; routePath?: string };

export function onRequestError(error: unknown, request: RequestInfo, context: ErrorContext): void {
  // The request path can carry query parameters, and this app puts an order id
  // and a phone number in the tracking URL — reportError redacts values that look
  // like credentials, but a query string is better dropped than filtered.
  const path = (request?.path ?? "unknown").split("?")[0];

  reportError(error, `request:${path}`, {
    method: request?.method,
    // routePath is the pattern (/products/[id]) where path is the instance,
    // which is what groups these usefully.
    routePath: context?.routePath,
    routeType: context?.routeType,
    routerKind: context?.routerKind,
  });
}
