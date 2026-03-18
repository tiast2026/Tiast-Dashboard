'use client'

import Image from 'next/image'
import { Image as ImageIcon } from 'lucide-react'

interface ProductImageProps {
  src: string | null | undefined
  alt?: string
  size?: number
  className?: string
}

/**
 * Optimized product image using next/image.
 * Falls back to a placeholder when no src is provided.
 */
export default function ProductImage({ src, alt = '', size = 40, className }: ProductImageProps) {
  if (!src) {
    return (
      <div
        className={`bg-gray-100 rounded flex items-center justify-center text-gray-300 shrink-0 ${className ?? ''}`}
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      >
        <ImageIcon className="w-4 h-4" />
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`object-cover rounded shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      loading="lazy"
      unoptimized={!src.includes('rakuten.co.jp')}
    />
  )
}
