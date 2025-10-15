import { showDashboard } from "$lib/flags";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
  const dashboard = await showDashboard();
  return { title: dashboard ? "new dashboard" : "old dashboard" };
};
