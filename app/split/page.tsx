import { SplitView } from "@/components/split-view";
import { anchorFromParams } from "@/lib/anchors";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || null;

/** `/split?file=<pdf or code>&note=<markdown>[&lines=19-22|&page=3]`; either side may be missing. */
export default async function SplitPage({ searchParams }: PageProps<"/split">) {
  const params = await searchParams;
  const anchor = anchorFromParams({ get: (name) => first(params[name]) });
  return <SplitView file={first(params.file)} note={first(params.note)} anchor={anchor} />;
}
