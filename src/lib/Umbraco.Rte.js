import { parse } from "node-html-parser";
import { wysiwygImageLoader } from "@/lib/Umbraco.Media.js";
import { toPascalCase } from "@/js/helpers/helpers.js";
import { getConfig } from "@/lib/Umbraco.Config.js";

const inlineTemplates = import.meta.glob(
	"../Templates/modules/inline/*.astro",
	{ eager: true },
);

/**
 * Returns a rules map that renames HTML tags in an RTE node tree.
 *
 * Accepts either a single pair or an array of pairs:
 * - `["h2", "h3"]`
 * - `[["h2", "h3"], ["h3", "h4"]]`
 *
 * @param {Array<[string, string]> | [string, string]} pairs - Tag replacement pair(s): [fromTag, toTag].
 * @returns {Record<string, (node: import('node-html-parser').HTMLElement) => import('node-html-parser').HTMLElement>}
 */
export function replaceTags(pairs = []) {
	if (!pairs.length) return {};
	const normalized = typeof pairs[0] === "string" ? [pairs] : pairs;
	return Object.fromEntries(
		normalized.map(([from, to]) => [
			from,
			(node) => {
				node.rawTagName = to;
				return node;
			},
		]),
	);
}

/**
 * Resolves an inline block component by content type alias.
 * Converts camelCase alias to PascalCase and matches it to a file in the inline templates folder.
 *
 * @param {string} contentType - camelCase content type alias (e.g. `"quoteBlock"`)
 * @returns {AstroComponent|null}
 */
function resolveInlineTemplate(contentType) {
	const name = toPascalCase(contentType);
	const path = `../Templates/modules/inline/${name}.astro`;
	return inlineTemplates[path]?.default ?? null;
}

/**
 * Walks an HTML node depth-first, applying any matching transform rule.
 * Children are processed before their parent so a parent rule sees the final child HTML.
 *
 * @param {import('node-html-parser').Node} node
 * @param {Record<string, (node: any) => string | null>} mergedRules
 * @returns {string}
 */
function applyRules(node, mergedRules) {
	if (node.nodeType === 3) return node.toString();

	const tag = node.rawTagName?.toLowerCase();
	if (!tag) return node.toString();

	node.childNodes.forEach((child) => {
		if (child.nodeType !== 3) {
			const replaced = applyRules(child, mergedRules);
			if (replaced !== child.toString()) child.replaceWith(replaced);
		}
	});

	if (mergedRules[tag]) return mergedRules[tag](node) ?? node.toString();

	return node.toString();
}

/**
 * Returns true if the node or any descendant is an umb-rte-block element.
 *
 * @param {import('node-html-parser').Node} node
 * @returns {boolean}
 */
function hasBlockDescendant(node) {
	if (node.nodeType === 3) return false;
	if (node.rawTagName?.toLowerCase() === "umb-rte-block") return true;
	return node.childNodes.some(hasBlockDescendant);
}

/**
 * Recursively converts a node into renderable segments.
 * umb-rte-block nodes are extracted as block segments at any nesting depth.
 * When a block is nested inside a regular element, the parent is split into
 * html segments around it, each wrapped in the parent's opening/closing tags.
 * All other nodes (including a tags) are passed through applyRules so that
 * transform rules apply at every level while the HTML hierarchy is preserved.
 *
 * @param {import('node-html-parser').Node} node
 * @param {Record<string, (node: any) => string | null>} mergedRules
 * @param {Map<string, any>} blockMap
 * @returns {Array<{type: string, [key: string]: any}>}
 */
function nodeToSegments(node, mergedRules, blockMap) {
	if (node.nodeType === 3) {
		const text = node.toString();
		return text ? [{ type: "html", content: text }] : [];
	}

	const tag = node.rawTagName?.toLowerCase();
	if (!tag) return [{ type: "html", content: node.toString() }];

	if (tag === "umb-rte-block") {
		const id = node.getAttribute("data-content-id");
		const blockData = blockMap.get(id);
		const component = blockData?.content?.contentType
			? resolveInlineTemplate(blockData.content.contentType)
			: null;
		return [{ type: "block", id, blockData, component }];
	}

	if (!hasBlockDescendant(node)) {
		// No blocks in subtree — apply rules to the whole node and return as HTML.
		// This handles images, tag replacements, etc. at any depth.
		return [{ type: "html", content: applyRules(node, mergedRules) }];
	}

	// Node contains umb-rte-block descendants — process children recursively,
	// wrapping consecutive html chunks in the parent's open/close tags.
	const attrs = node.rawAttrs ? ` ${node.rawAttrs}` : "";
	const open = `<${node.rawTagName}${attrs}>`;
	const close = `</${node.rawTagName}>`;

	const result = [];
	let htmlBuffer = [];

	for (const child of node.childNodes) {
		for (const seg of nodeToSegments(child, mergedRules, blockMap)) {
			if (seg.type === "html") {
				htmlBuffer.push(seg.content);
			} else {
				if (htmlBuffer.length) {
					result.push({
						type: "html",
						content: open + htmlBuffer.join("") + close,
					});
					htmlBuffer = [];
				}
				result.push(seg);
			}
		}
	}

	if (htmlBuffer.length) {
		result.push({
			type: "html",
			content: open + htmlBuffer.join("") + close,
		});
	}

	return result;
}

/**
 * Parses an Umbraco RTE content object into an array of renderable segments.
 * Each segment is either `{ type: 'html', content: string }` or
 * `{ type: 'block', id, blockData, component }`.
 *
 * @param {{ markup: string, blocks: any[] }} content - Umbraco rich text object.
 * @param {Record<string, (node: any) => string | null>} [rules] - Caller-supplied tag transform rules.
 * @param {string} [imgSizes="100vw"] - `sizes` attribute forwarded to the image loader.
 * @returns {Array<{type: string, [key: string]: any}>}
 */
export function parseRteSegments(content, rules = {}, imgSizes = "100vw") {
	const { mediaDomain } = getConfig();
	const mergedRules = {
		img: (node) => wysiwygImageLoader(node, imgSizes),
		table: (node) => `<div class="table-wrapper">${node.toString()}</div>`,
		a: (node) => {
			const href = node.getAttribute("href") ?? "";
			if (href.startsWith("/media")) {
				node.setAttribute("href", `${mediaDomain}${href}`);
				node.setAttribute("download", `${mediaDomain}${href}`);
				node.setAttribute("target", "_blank");
			}
			return node.toString();
		},
		...rules,
	};

	const { markup, blocks } = content;
	const blockMap = new Map(
		(blocks ?? []).map((block) => [block.content.id, block]),
	);

	const root = parse(markup);
	const raw = [];

	for (const child of root.childNodes) {
		raw.push(...nodeToSegments(child, mergedRules, blockMap));
	}

	// Merge consecutive html segments into one
	return raw.reduce((acc, seg) => {
		if (
			seg.type === "html" &&
			acc.length &&
			acc[acc.length - 1].type === "html"
		) {
			acc[acc.length - 1].content += seg.content;
		} else {
			acc.push(seg);
		}
		return acc;
	}, []);
}
