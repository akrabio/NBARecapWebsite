/** @type {import('next').NextConfig} */
const nextConfig = {
  // The game share image reads team logos from disk; bundle them with it.
  outputFileTracingIncludes: {
    "/game/**": ["./public/logos/**/*"],
  },
  async headers() {
    return [
      {
        // Always revalidate the service worker so updates roll out promptly.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
