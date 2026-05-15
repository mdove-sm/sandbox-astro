import { getConfig } from "./Umbraco.Config.js";
import crypto from "crypto";
const config = getConfig();

export const srcSizes = [
	100, 200, 320, 480, 640, 768, 960, 1024, 1280, 1440, 1920, 2560, 3200, 3500,
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

function getFocalPoint(image, crop) {
	const focalPoint = image?.focalPoint || { left: 0.5, top: 0.5 };

	let rxy = { x1: 0, y1: 0, x2: 0, y2: 0 };

	if (crop?.coordinates) {
		rxy = crop.coordinates;
	} else {
		const imageWidth = image.width;
		const imageHeight = image.height;
		const cropAspect = crop.width / crop.height;

		// Calculate the crop dimensions in pixels, constrained to the source image
		let cropW, cropH;
		if (imageWidth / imageHeight > cropAspect) {
			// Image is wider than crop aspect — fit height, derive width
			cropH = imageHeight;
			cropW = cropH * cropAspect;
		} else {
			// Image is taller than crop aspect — fit width, derive height
			cropW = imageWidth;
			cropH = cropW / cropAspect;
		}

		// Calculate ideal crop origin (in pixels) to centre the focal point
		const focalX = focalPoint.left * imageWidth;
		const focalY = focalPoint.top * imageHeight;

		let x1px = focalX - cropW / 2;
		let y1px = focalY - cropH / 2;

		// Clamp so the crop doesn't exceed image bounds
		x1px = Math.max(0, Math.min(x1px, imageWidth - cropW));
		y1px = Math.max(0, Math.min(y1px, imageHeight - cropH));

		const x2px = x1px + cropW;
		const y2px = y1px + cropH;

		// Convert pixel positions to the 0–1 coordinate space Umbraco expects
		// x1/y1 = distance from top-left, x2/y2 = distance from bottom-right
		rxy = {
			x1: x1px / imageWidth,
			y1: y1px / imageHeight,
			x2: 1 - x2px / imageWidth,
			y2: 1 - y2px / imageHeight,
		};
	}
	return `${rxy.x1},${rxy.y1},${rxy.x2},${rxy.y2}`;
}

