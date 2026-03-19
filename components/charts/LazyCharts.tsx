'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const ChartSkeleton = () => <Skeleton className="h-[350px] w-full" />

export const LazyDailySalesChart = dynamic(
  () => import('./DailySalesChart'),
  { loading: ChartSkeleton, ssr: false }
)

export const LazyBarChart = dynamic(
  () => import('./BarChart'),
  { loading: ChartSkeleton, ssr: false }
)

export const LazyStackedBarChart = dynamic(
  () => import('./StackedBarChart'),
  { loading: ChartSkeleton, ssr: false }
)

export const LazyDonutChart = dynamic(
  () => import('./DonutChart'),
  { loading: ChartSkeleton, ssr: false }
)
