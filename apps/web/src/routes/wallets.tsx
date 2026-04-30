import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/wallets")({
  component: WalletsLayout,
});

function WalletsLayout() {
  return <Outlet />;
}
