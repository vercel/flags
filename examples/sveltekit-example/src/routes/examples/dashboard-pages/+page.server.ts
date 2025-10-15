import { showNewDashboard } from "$lib/flags";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const dashboard = await showNewDashboard();

  return { dashboard };
};
