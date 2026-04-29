import { createFileRoute } from "@tanstack/react-router";
import { VaultDetailView } from "@/screens/VaultDetail";

export const Route = createFileRoute("/vault-detail")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : "",
  }),
  component: VaultDetailBySearch,
});

function VaultDetailBySearch() {
  const { id } = Route.useSearch();
  return <VaultDetailView vaultId={id} />;
}
