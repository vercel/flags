import { createChatRoute } from "@vercel/geistdocs/routes/chat";
import { config } from "@/lib/geistdocs/config";
import { geistdocsSource } from "@/lib/geistdocs/source";

const chatRoute = createChatRoute({
  config,
  source: geistdocsSource,
});

export const POST = chatRoute.POST;
export const maxDuration = 800;
