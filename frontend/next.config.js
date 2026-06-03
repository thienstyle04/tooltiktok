/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: __dirname,
  experimental: {
    mcpServer: false,
  },
};

module.exports = nextConfig;
