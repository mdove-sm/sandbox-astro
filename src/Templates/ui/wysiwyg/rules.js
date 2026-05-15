/**
 * Returns a rules map that renames HTML tags in a Wysiwyg node tree.
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
spo;
