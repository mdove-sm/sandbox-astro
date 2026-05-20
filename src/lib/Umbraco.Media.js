import { getConfig } from "./Umbraco.Config.js";
import crypto from "crypto";
const config = getConfig();

export const srcSizes = [
	140, 280, 320, 480, 640, 768, 960, 1024, 1280, 1440, 1920, 2560, 3200, 3500,
];

export function wysiwygImageLoader(node, imgSizes) {
	const { src, width, height, alt } = node.attrs;

	let url = config.mediaDomain + src;

	let srcSet = [];

	srcSizes.forEach((size) => {
		let sizeUrl = new URL(url);

		sizeUrl.searchParams.set("width", size);
		sizeUrl.searchParams.set("height", Math.round(size * (height / width)));
		sizeUrl.searchParams.delete("hmac");

		srcSet.push(`${addUmbracoHmac(sizeUrl.toString())} ${size}w`);
	});

	return `<img
		src="${url}"
		width="${width}"
		height="${height}"
		srcset="${srcSet.join(",")}"
		sizes="${imgSizes}"
		alt="${alt}"
		loading="lazy"
	/>`;
}

export function addUmbracoHmac(url) {
	const secret = Buffer.from(config.hmacKey, "hex");

	const hmac = crypto.createHmac("sha256", secret).update(url).digest("hex");

	// Append hmac at the very end
	const separator = url.includes("?") ? "&" : "?";
	return `${url}${separator}hmac=${hmac}`;
}

/**
 * Calculates the crop-coordinate string (`x1,y1,x2,y2`) that Umbraco's image
 * processor expects. Uses pre-defined coordinates when available; otherwise
 * derives them from the image's focal point.
 *
 * All values are in the 0–1 range; x2/y2 are distances from the bottom-right corner.
 */
export function getFocalPoint(image, crop) {
	const focalPoint = image?.focalPoint || { left: 0.5, top: 0.5 };

	let rxy = { x1: 0, y1: 0, x2: 0, y2: 0 };

	if (crop?.coordinates) {
		rxy = crop.coordinates;
	} else {
		const imageWidth = image.width;
		const imageHeight = image.height;
		const cropAspect = crop.width / crop.height;

		let cropW, cropH;
		if (imageWidth / imageHeight > cropAspect) {
			cropH = imageHeight;
			cropW = cropH * cropAspect;
		} else {
			cropW = imageWidth;
			cropH = cropW / cropAspect;
		}

		const focalX = focalPoint.left * imageWidth;
		const focalY = focalPoint.top * imageHeight;

		let x1px = focalX - cropW / 2;
		let y1px = focalY - cropH / 2;

		x1px = Math.max(0, Math.min(x1px, imageWidth - cropW));
		y1px = Math.max(0, Math.min(y1px, imageHeight - cropH));

		const x2px = x1px + cropW;
		const y2px = y1px + cropH;

		rxy = {
			x1: x1px / imageWidth,
			y1: y1px / imageHeight,
			x2: 1 - x2px / imageWidth,
			y2: 1 - y2px / imageHeight,
		};
	}
	return `${rxy.x1},${rxy.y1},${rxy.x2},${rxy.y2}`;
}

/**
 * Builds a signed Umbraco image URL for a given display width and optional crop alias.
 * Returns the URL and the computed height so callers have no need for side-effect tracking.
 * @param {import('../types/models/IApiMediaWithCropsModel').IApiMediaWithCropsModel} image
 * @param {number} width
 * @param {string | undefined} [crop]
 * @returns {{ src: string, height: number }}
 */
export function buildSrc(image, width, crop) {
	const resolvedCrop = crop
		? ((image.crops ?? []).find((x) => x.alias === crop) ?? null)
		: null;

	const ratio = {
		x: resolvedCrop ? resolvedCrop.width : (image.width ?? width),
		y: resolvedCrop ? resolvedCrop.height : (image.height ?? width),
	};

	const height = Math.round(width * (ratio.y / ratio.x));
	const rxyString = resolvedCrop ? getFocalPoint(image, resolvedCrop) : null;

	const src = addUmbracoHmac(
		`${config.mediaDomain}${image.url}?${rxyString ? "cc=" + rxyString + "&" : ""}width=${width}&height=${height}`,
	);

	return { src, height };
}

/**
 * Builds a srcset string for an image across the provided size stops.
 * Defaults to the full srcSizes array when no stops are supplied.
 * @param {import('../types/models/IApiMediaWithCropsModel').IApiMediaWithCropsModel} image
 * @param {string | undefined} [crop]
 * @param {number[]} [stops]
 * @returns {string}
 */
export function buildSrcSet(image, crop, stops = srcSizes) {
	return stops
		.map((size) => `${buildSrc(image, size, crop).src} ${size}w`)
		.join(",");
}

