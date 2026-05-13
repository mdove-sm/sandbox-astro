export function getConfig() {
	const domain = import.meta.env.UMBRACO_DOMAIN;
	const mediaDomain = import.meta.env.PUBLIC_MEDIA_DOMAIN;
	const hmacKey = import.meta.env.UMBRACO_HMAC_SECRET_KEY;
	const previewEnabled = import.meta.env.UMBRACO_PREVIEW_ENABLE;
	const apiKey = import.meta.env.UMBRACO_API_KEY;
	const siteId = import.meta.env.UMBRACO_SITE_ID;
	const userAgent = import.meta.env.USER_AGENT;

	return {
		apiKey,
		domain,
		previewEnabled,
		mediaDomain,
		hmacKey,
		siteId,
		userAgent,
	};
}
