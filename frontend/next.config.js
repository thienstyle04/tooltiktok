const rawBackendOrigin = process.env.NEXT_PUBLIC_BACKEND_ORIGIN || 'http://127.0.0.1:3000';
const backendOrigin = rawBackendOrigin.replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    mcpServer: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: '/assets/:path*',
        destination: `${backendOrigin}/assets/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
