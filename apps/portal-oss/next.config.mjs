/** @type {import('next').NextConfig} */
const allowedDevOrigins = (process.env.ASTRO_PORTAL_DEV_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins,
  // The page of the sign-in link reads its code from the address's
  // fragment; it never tells another site where the visitor came from.
  async headers() {
    return [
      {
        source: "/auth/link",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      // A private gallery: its address is its secret — never told to
      // another site — and no engine indexes its pages.
      ...["/:locale/p/:path*", "/p/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
    ];
  },
  serverExternalPackages: ["geo-tz"],
  transpilePackages: [
    "astro-contracts",
    "astro-core",
    "planner",
    "planner-projects",
    "portal",
    "portal-app",
  ],
  // A test harness gives each server it starts its own build directory.
  ...(process.env.ASTRO_PORTAL_NEXT_DIST_DIR
    ? { distDir: process.env.ASTRO_PORTAL_NEXT_DIST_DIR }
    : {}),
  images: {
    localPatterns: [{ pathname: "/images/**" }],
  },
};

export default nextConfig;
