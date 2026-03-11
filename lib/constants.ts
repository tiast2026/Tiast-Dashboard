// Brand colors
export const BRAND_COLORS: Record<string, string> = {
  NOAHL: '#C4A882',
  BLACKQUEEN: '#1A1A1A',
  MYRTH: '#8FAE8B',
}

// Channel colors
export const CHANNEL_COLORS: Record<string, string> = {
  rakuten: '#BF0000',
  official: '#4A90D9',
  tiktok: '#010101',
  rakuten_fashion: '#E60033',
  shoplist: '#FF6B35',
  aupay: '#FF5722',
  yahoo: '#FF0033',
  zozo: '#1A1A1A',
}

// Channel group colors (for trend chart)
export const CHANNEL_GROUP_COLORS: Record<string, string> = {
  '楽天系': '#BF0000',
  '公式系': '#4A90D9',
  'TikTok系': '#010101',
  'その他': '#999999',
}

// Lifecycle colors
export const LIFECYCLE_COLORS: Record<string, string> = {
  '助走期': '#3B82F6',
  '成長期': '#22C55E',
  '成熟期': '#EAB308',
  '衰退期': '#EF4444',
}

// Gross profit rate thresholds
export const PROFIT_RATE_COLORS = {
  high: { threshold: 0.6, color: '#22C55E' },
  mid: { threshold: 0.4, color: '#EAB308' },
  low: { threshold: 0, color: '#EF4444' },
}

// Navigation items
export const NAV_ITEMS = [
  { label: 'ダッシュボード', href: '/dashboard', icon: 'BarChart3', phase: 1 },
  { label: '商品分析', href: '/products', icon: 'Tag', phase: 1 },
  { label: '在庫管理', href: '/inventory', icon: 'Package', phase: 1 },
  { label: '顧客分析', href: '/customers', icon: 'Users', phase: 1 },
  { type: 'separator' as const },
  { label: '広告効果', href: '/ads', icon: 'Megaphone', phase: 2 },
  { label: 'アクセス分析', href: '/analytics', icon: 'TrendingUp', phase: 2 },
  { label: '予算管理', href: '/budget', icon: 'Wallet', phase: 3 },
] as const

// Brand options for filters
export const BRAND_OPTIONS = ['全て', 'NOAHL', 'MYRTH', 'BLACKQUEEN'] as const

// Category options
export const CATEGORY_OPTIONS = [
  '全て', 'トップス', 'パンツ', 'ワンピース', 'アウター', 'スカート',
  'ニット', 'シャツ', 'カーディガン', 'ジャケット', 'コート', 'バッグ', 'その他',
] as const

// Season options
export const SEASON_OPTIONS = ['全て', '春', '夏', '秋', '冬'] as const

// Price tier options
export const PRICE_TIER_OPTIONS = [
  '全て', '〜2,999円', '3,000〜4,999円', '5,000〜6,999円',
  '7,000〜9,999円', '10,000円〜',
] as const

// Helper to classify shop into channel group
export function getChannelGroup(shopName: string): string {
  if (shopName.includes('楽天') && !shopName.includes('RakutenFashion')) return '楽天系'
  if (shopName.includes('公式')) return '公式系'
  if (shopName.includes('TIKTOK') || shopName.includes('TikTok')) return 'TikTok系'
  return 'その他'
}

// Helper to get channel key from shop name
export function getChannelKey(shopName: string): string {
  if (shopName.includes('RakutenFashion')) return 'rakuten_fashion'
  if (shopName.includes('楽天')) return 'rakuten'
  if (shopName.includes('公式')) return 'official'
  if (shopName.includes('TIKTOK') || shopName.includes('TikTok')) return 'tiktok'
  if (shopName.includes('SHOPLIST')) return 'shoplist'
  if (shopName.includes('aupay')) return 'aupay'
  if (shopName.includes('YAHOO')) return 'yahoo'
  if (shopName.includes('ZOZO')) return 'zozo'
  return 'other'
}
