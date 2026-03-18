/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.rakuten.co.jp',
      },
      {
        protocol: 'https',
        hostname: 'thumbnail.image.rakuten.co.jp',
      },
    ],
  },
  // Compress responses for faster transfer
  compress: true,
  // Optimize package imports - tree-shake heavy libraries
  experimental: {
    optimizePackageImports: ['recharts', 'lucide-react', '@radix-ui/react-icons'],
  },
  // Enable strict mode for better dev performance insights
  reactStrictMode: true,
}

export default nextConfig
