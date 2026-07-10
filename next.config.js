/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    config.externals.push({
      '@wfcd/items': 'commonjs @wfcd/items'
    });
    return config;
  },
};
module.exports = nextConfig;
