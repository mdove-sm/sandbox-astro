// @ts-check
import { defineConfig } from 'astro/config';
import path from "path";
import node from "@astrojs/node";
import mkcert from "vite-plugin-mkcert";
import { loadEnv } from "vite";

const { NODE_TLS_REJECT_UNAUTHORIZED } = loadEnv(
	process.env.NODE_ENV,
	process.cwd(),
	"",
);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = NODE_TLS_REJECT_UNAUTHORIZED;

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [mkcert()],
		resolve: {
			alias: {
				"@": path.resolve("./src"),
			},
		},
	},
	// output: process.env.PRERENDER === "false" ? "static" : "server",
	image: {
		domains: ["astro.build", "https://localhost:44379"],
	},
	// adapter: node({
	// 	mode: "standalone",
	// }),
});