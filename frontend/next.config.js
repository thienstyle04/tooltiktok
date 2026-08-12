/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Không hiển thị nút Dev Tools chữ "N" trong giao diện người dùng.
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: __dirname,
  experimental: {
    mcpServer: false,
  },
};

module.exports = nextConfig;
