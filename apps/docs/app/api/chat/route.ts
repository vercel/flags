import { createChatRoute } from "@vercel/geistdocs/routes/chat";
import { config } from "@/lib/geistdocs/config";
import { geistdocsSource } from "@/lib/geistdocs/source";

const chatProxyUrl = process.env.GEISTDOCS_CHAT_PROXY_URL;
const chatProxyToken = process.env.GEISTDOCS_CHAT_PROXY_TOKEN;

const chatRoute = createChatRoute({
  config,
  proxy: chatProxyUrl
    ? {
        url: chatProxyUrl,
        headers: chatProxyToken
          ? { Authorization: `Bearer ${chatProxyToken}` }
          : undefined,
      }
    : undefined,
  sources: [geistdocsSource],
});

export const POST = chatRoute.POST;
export const maxDuration = 800;
