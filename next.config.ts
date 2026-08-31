import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  // SEC-AUDIT: CSP com nonce dinâmico por request.
  // O middleware.ts gera o nonce, passa no CSP (request + response),
  // e o Next.js injeta automaticamente nos scripts inline de hidratação.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
