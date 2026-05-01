import { createFileRoute } from "@tanstack/react-router";
import { Wallets } from "@/screens/Wallets";

export const Route = createFileRoute("/wallets/")({
  component: Wallets,
});
