import { createFileRoute } from "@tanstack/react-router";
import { VaultDetail } from "@/screens/VaultDetail";

export const Route = createFileRoute("/vaults/$vaultId")({
  component: VaultDetail,
});
