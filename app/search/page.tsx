import { SearchView } from "@/components/search-view";

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  // Typing updates the URL in place; following a link here remounts with the new query.
  return <SearchView key={query} initialQuery={query} />;
}
