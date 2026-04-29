import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "@/screens/Settings";
export const Route = createFileRoute("/settings")({ component: Settings });
