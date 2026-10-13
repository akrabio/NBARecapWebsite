/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev only: let phones on the local network load the dev server's scripts
  // (otherwise the page never hydrates there and no button works).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
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
