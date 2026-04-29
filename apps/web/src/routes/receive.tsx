import { createFileRoute } from "@tanstack/react-router";
import { Receive } from "@/screens/Receive";
export const Route = createFileRoute("/receive")({ component: Receive });
