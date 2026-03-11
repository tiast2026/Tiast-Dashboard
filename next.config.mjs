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
}

export default nextConfig
