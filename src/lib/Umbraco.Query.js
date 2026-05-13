// import { preview } from "astro";
import { getConfig } from "./Umbraco.Config.js";
const config = getConfig();

/**
 * Low-level fetch against the Umbraco Content Delivery API. Attaches the
 * standard auth/site headers from the resolved config and returns the parsed
 * JSON response, or `null` if the request errors out.
 *
 * @param {string | URL} url - The fully qualified Delivery API endpoint to GET.
 * @param {boolean} [preview=false] - If true, sends `Preview: true` so unpublished content is returned.
 * @param {boolean} [debug=false] - If true, logs the config, request URL, and parsed response.
 * @returns {Promise<any | null>} The parsed JSON body, or `null` on network/HTTP error.
 */
export async function callContentDeliveryAPI(
	url,
	preview = false,
	debug = false,
) {
	let data = null;
	if (debug) {
		console.log("CONFIG:", config);
		console.log("NEW REQUEST TO :", url);
	}
	try {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				...(config.userAgent && { "user-agent": config.userAgent }),
				...(config.apiKey && { "Api-Key": config.apiKey }),
				...(preview && { Preview: "true" }),
				...(config.siteId && { "Start-Item": config.siteId }),
				"Accept-Language": "en-US",
			},
		});

		if (!response.ok) {
			const text = await response.text();
			console.log("BUILD API ERROR:", response.status, text);
			throw new Error("API failed during build");
			// return data;
		}
		data = await response.json();
		if (debug) console.log("RESPONSE:", data);

		return data;
	} catch (err) {
		console.log("ERROR:", err);
		return null;
	}
}

/**
 * Fetches a single content item via Umbraco's `/content/item/{path-or-id}`
 * endpoint. Any querystring options are joined with `&` and appended to the URL.
 *
 * @param {string} pathOrId - Route path (e.g. `/about-us`) or content GUID/id.
 * @param {string[]} [options=[]] - Querystring fragments such as `fields=properties[$all]`.
 * @param {boolean} [preview=false] - If true, requests preview (unpublished) content.
 * @param {boolean} [debug=false] - If true, the underlying API call logs its response.
 * @returns {Promise<any | null>} The content item, or `null` on error.
 */
export async function fetchItem(
	pathOrId,
	options = [],
	preview = false,
	debug = false,
) {
	let url = new URL(
		`${config.domain}/umbraco/delivery/api/v2/content/item/${pathOrId}`,
	);
	if (options.length) {
		url = `${url}?${options.join("&")}`;
	}
	let data = await callContentDeliveryAPI(url, preview, debug);
	return data;
}

/**
 * Fetches multiple content items by their IDs. Stub — not yet implemented.
 *
 * @param {string[]} [ids=[]] - Content item IDs/GUIDs to retrieve.
 * @param {string[]} [options=[]] - Querystring fragments to append (e.g. `expand=...`).
 * @param {boolean} [preview=false] - If true, requests preview (unpublished) content.
 * @param {boolean} [debug=false] - If true, the underlying API call logs its response.
 * @returns {Promise<void>}
 */
export async function fetchItems(
	ids = [],
	options = [],
	preview = false,
	debug = false,
) {}

/**
 * Queries the Umbraco `/content` listing endpoint. When `takeAll` is true the
 * call paginates through every page (100 per page) and returns the merged
 * result; otherwise a single page is returned as-is.
 *
 * @param {string[]} [options=[]] - Querystring fragments such as `filter=contentType:landingPage` or `fields=properties[$all]`.
 * @param {boolean} [takeAll=false] - If true, pages through all results and returns `{ total, items }`.
 * @param {boolean} [preview=false] - If true, requests preview (unpublished) content.
 * @param {boolean} [debug=false] - If true, the underlying API call logs its response.
 * @returns {Promise<{ total: number, items: any[] } | null>} The merged or single-page response.
 */
export async function fetchContent(
	options = [],
	takeAll = false,
	preview = false,
	debug = false,
) {
	let url = new URL(`${config.domain}/umbraco/delivery/api/v2/content`);

	if (options.length) {
		url = `${url}?${options.join("&")}`;
	}

	let data;

	if (takeAll) {
		data = await queryAll(url, preview, debug);
	} else {
		data = await callContentDeliveryAPI(url, preview, debug);
	}

	return data;
}

/**
 * Internal pagination helper. Forces `take=100`, honors any pre-existing
 * `skip`, then loops until every page has been collected and merged into a
 * single `{ total, items }` envelope.
 *
 * @param {string | URL} url - The base `/content` listing URL (querystring may contain `skip`).
 * @param {boolean} [preview=false] - Forwarded to `callContentDeliveryAPI` for preview content.
 * @param {boolean} [debug=false] - Forwarded to `callContentDeliveryAPI` for response logging.
 * @returns {Promise<{ total: number, items: any[] } | undefined>} All collected items, or `undefined` if `url` is falsy.
 */
async function queryAll(url, preview = false, debug = false) {
	if (!url) return;

	// Data Item storage
	let items = [];

	// Loop tracking
	let page = 0;
	let total = 1;
	let skip = 0;

	url = new URL(url);

	// strip take param to use default of 10
	// if (url?.searchParams && url.searchParams.has("take"))

	url.searchParams.set("take", "100");
	// Store and strip skip param
	if (url?.searchParams && url.searchParams.has("skip")) {
		skip = url.searchParams.get("skip");
		url.searchParams.delete("skip");
	}

	// Loop to collect data
	do {
		// add adjusted skips to looped queries
		if (page > 0) url.searchParams.set("skip", page * 100 + skip);

		// get data set.
		let thisdata = await callContentDeliveryAPI(url, preview, debug);

		// Merge new data
		items = items.concat(thisdata.items);

		// update loop tracking
		if (page === 0) total = Math.ceil(thisdata.total / 100);

		page++;
	} while (page < total);

	// reformat data
	let data = {
		total: items.length,
		items: items,
	};

	// console.log("RETURNING DATA:", data);
	return data;
}
