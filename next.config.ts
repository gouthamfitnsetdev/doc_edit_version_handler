import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // pdfjs-dist worker is served as a static file from /public — exclude from webpack bundle
    config.resolve.alias.canvas = false
    return config
  },
}

export default nextConfig;
