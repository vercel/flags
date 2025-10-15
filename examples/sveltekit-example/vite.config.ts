import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { vercelToolbar } from "@vercel/toolbar/plugins/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [sveltekit(), vercelToolbar(), tailwindcss()],
});
