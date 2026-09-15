"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { parseLocation, type WorkspaceLocation } from "@/lib/paths";

/**
 * Current route as a workspace location. Uses `useSearchParams`, so callers
 * must sit inside a <Suspense> boundary or static pages fail to prerender.
 */
export function useWorkspaceLocation(): WorkspaceLocation {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return useMemo(() => parseLocation(pathname, new URLSearchParams(search)), [pathname, search]);
}
