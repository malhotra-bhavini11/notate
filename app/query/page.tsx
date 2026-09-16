import { QueryView } from "@/components/query-view";

export default async function QueryPage({ searchParams }: PageProps<"/query">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  // Typing updates the URL without navigating; following a link here remounts with the new query.
  return <QueryView key={query} initialQuery={query} />;
}
