import { createFileRoute } from "@tanstack/react-router";
import { Vaults } from "@/screens/Vaults";

export const Route = createFileRoute("/vaults")({
  component: Vaults,
});
