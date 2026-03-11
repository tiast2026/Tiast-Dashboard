'use client'

import { Badge } from '@/components/ui/badge'
import { LIFECYCLE_COLORS } from '@/lib/constants'

interface LifecycleBadgeProps {
  stage: string
}

export default function LifecycleBadge({ stage }: LifecycleBadgeProps) {
  const color = LIFECYCLE_COLORS[stage] || '#6B7280'

  return (
    <Badge
      className="text-white text-xs"
      style={{ backgroundColor: color, borderColor: color }}
    >
      {stage || '-'}
    </Badge>
  )
}
