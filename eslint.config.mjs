import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    rules: {
      // Images are external (ESPN photos, YouTube thumbnails) or small local
      // logos; next/image optimization would only add image-quota usage.
      "@next/next/no-img-element": "off",
    },
  },
  { ignores: [".next/**", "mockups/**", "public/**"] },
];

export default config;
