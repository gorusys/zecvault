import { createFileRoute } from "@tanstack/react-router";
import { WalletDetail } from "@/screens/WalletDetail";

export const Route = createFileRoute("/wallets/$walletId")({
  component: WalletDetailRouteComponent,
});

function WalletDetailRouteComponent() {
  const { walletId } = Route.useParams();
  return <WalletDetail walletId={walletId} />;
}
