import fs from "node:fs";
import path from "node:path";
import { generate } from "openapi-typescript-codegen";
import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "");
process.env.NODE_TLS_REJECT_UNAUTHORIZED =
	env.NODE_TLS_REJECT_UNAUTHORIZED ?? "0";

const domain = env.UMBRACO_DOMAIN?.replace(/^"|"$/g, "").trim();
if (!domain) {
	console.error("UMBRACO_DOMAIN is not set in .env.local");
	process.exit(1);
}

const swaggerUrl = `${domain}/umbraco/swagger/delivery/swagger.json`;
const tmpFile = path.resolve(process.cwd(), ".swagger.tmp.json");

console.log(`Fetching ${swaggerUrl}`);
const res = await fetch(swaggerUrl);
if (!res.ok) {
	console.error(`Failed to fetch swagger: ${res.status} ${res.statusText}`);
	process.exit(1);
}
fs.writeFileSync(tmpFile, await res.text());

try {
	await generate({
		input: tmpFile,
		output: "src/types",
		postfixServices: "Resource",
		useOptions: true,
	});
	console.log("Types generated in src/types");
} finally {
	fs.unlinkSync(tmpFile);
}
