import { SplitView } from "@/components/split-view";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || null;

/** `/split?file=<pdf or code>&note=<markdown>`; either side may be missing. */
export default async function SplitPage({ searchParams }: PageProps<"/split">) {
  const params = await searchParams;
  return <SplitView file={first(params.file)} note={first(params.note)} />;
}
