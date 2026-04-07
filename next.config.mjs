/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: {
    styledComponents: true,
  },
  transpilePackages: ['@bigcommerce/big-design', '@bigcommerce/big-design-theme', '@bigcommerce/big-design-icons'],
  async headers() {
    const csp = "frame-ancestors 'self' https://*.bigcommerce.com https://*.mybigcommerce.com https://login.bigcommerce.com";
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
