// Absolute site URL for canonical, Open Graph and sitemap links.
// Vercel sets VERCEL_PROJECT_PRODUCTION_URL in production.
export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";
