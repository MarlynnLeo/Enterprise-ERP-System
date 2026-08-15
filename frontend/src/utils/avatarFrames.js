/**
 * 头像特效配置
 * 已移除金光圣环，默认特效为彩虹星芒。
 */

export const DEFAULT_AVATAR_FRAME = 'rainbow-star'

/**
 * 若用户曾短暂保存过 CSS 企业环 id，映射回原图片特效，避免空白。
 * 历史 golden-halo / frame1 会映射到 rainbow-star。
 */
export const LEGACY_AVATAR_FRAME_MAP = Object.freeze({
  'golden-halo': 'rainbow-star',
  'executive-gold': 'rainbow-star',
  'slate-steel': 'silver-moon',
  'signal-blue': 'cyber-blue',
  'ocean-depth': 'ocean-crystal',
  'jade-soft': 'emerald-vine',
  amethyst: 'purple-magic',
  'rose-quartz': 'sakura-dream',
  'frost-edge': 'ice-crystal',
  'ember-glow': 'flame-phoenix',
  'pearl-soft': 'pearl-wings',
  'midnight-orbit': 'galaxy-orbit',
  'aurora-flow': 'neon-prism',
  obsidian: 'none',
  frame1: 'rainbow-star',
  frame2: 'silver-moon',
  frame3: 'ocean-crystal'
})

export const AVATAR_FRAME_OPTIONS = Object.freeze([
  {
    id: 'rainbow-star',
    name: '彩虹星芒',
    description: '彩虹分段圆环和星芒图片框，明亮活泼。',
    tags: ['图片框', '彩虹', '星光', '梦幻'],
    variant: 'image-frame',
    image: '/avatar-frames/rainbow-star.png',
    motion: 'breath',
    avatarRatio: 0.64,
    featured: true
  },
  {
    id: 'silver-moon',
    name: '银月星环',
    description: '银蓝月光图片框，带清冷星环质感。',
    tags: ['图片框', '月光', '星光'],
    variant: 'image-frame',
    image: '/avatar-frames/silver-moon.png',
    motion: 'slow-spin',
    avatarRatio: 0.64,
    featured: true
  },
  {
    id: 'flame-phoenix',
    name: '赤焰羽冠',
    description: '橙红火焰图片框，适合醒目的头像装扮。',
    tags: ['图片框', '火焰', '华丽'],
    variant: 'image-frame',
    image: '/avatar-frames/flame-phoenix.png',
    motion: 'breath',
    avatarRatio: 0.62,
    featured: true
  },
  {
    id: 'ocean-crystal',
    name: '海蓝晶环',
    description: '海蓝水晶图片框，明亮清透。',
    tags: ['图片框', '海洋', '宝石'],
    variant: 'image-frame',
    image: '/avatar-frames/ocean-crystal.png',
    motion: 'slow-spin',
    avatarRatio: 0.64,
    featured: true
  },
  {
    id: 'emerald-vine',
    name: '翠藤花环',
    description: '绿色藤蔓图片框，清爽自然。',
    tags: ['图片框', '藤蔓', '自然'],
    variant: 'image-frame',
    image: '/avatar-frames/emerald-vine.png',
    motion: 'breath',
    avatarRatio: 0.64,
    featured: true
  },
  {
    id: 'neon-prism',
    name: '霓虹棱镜',
    description: '紫粉霓虹图片框，带一点科技感。',
    tags: ['图片框', '霓虹', '科技'],
    variant: 'image-frame',
    image: '/avatar-frames/neon-prism.png',
    motion: 'slow-spin',
    avatarRatio: 0.64,
    featured: true
  },
  {
    id: 'royal-crown',
    name: '鎏金皇冠',
    description: '金色皇冠与宝石圆环图片框，适合醒目的身份展示。',
    tags: ['图片框', '皇冠', '金色', '华丽'],
    variant: 'image-frame',
    image: '/avatar-frames/royal-crown.png',
    // 皇冠非对称，不用整图旋转
    motion: 'breath',
    avatarRatio: 0.66,
    featured: true
  },
  {
    id: 'galaxy-orbit',
    name: '星河轨道',
    description: '星轨与晶点环绕的图片框，带空间感。',
    tags: ['图片框', '星河', '科技', '梦幻'],
    variant: 'image-frame',
    image: '/avatar-frames/galaxy-orbit.png',
    motion: 'slow-spin',
    avatarRatio: 0.64,
    featured: true
  },
  {
    id: 'sakura-dream',
    name: '樱花梦环',
    description: '粉色樱花与柔光圆环图片框，轻盈梦幻。',
    tags: ['图片框', '樱花', '自然', '梦幻'],
    variant: 'image-frame',
    image: '/avatar-frames/sakura-dream.png',
    // 樱花非对称，呼吸即可
    motion: 'breath',
    avatarRatio: 0.66,
    featured: true
  },
  {
    id: 'ice-crystal',
    name: '冰晶雪环',
    description: '冰蓝晶体图片框，干净清冷。',
    tags: ['图片框', '冰晶', '宝石', '梦幻'],
    variant: 'image-frame',
    image: '/avatar-frames/ice-crystal.png',
    motion: 'slow-spin',
    avatarRatio: 0.64,
    featured: true
  },
  {
    id: 'cyber-blue',
    name: '赛博蓝环',
    description: '蓝色赛博能量图片框，线条更利落。',
    tags: ['图片框', '赛博', '科技', '霓虹'],
    variant: 'image-frame',
    image: '/avatar-frames/cyber-blue.png',
    motion: 'slow-spin',
    avatarRatio: 0.64,
    featured: true
  },
  
  {
    id: 'lava-dragon',
    name: '熔岩龙焰',
    description: '熔岩火焰棱片图片框，视觉冲击更强。',
    tags: ['图片框', '熔岩', '火焰', '华丽'],
    variant: 'image-frame',
    image: '/avatar-frames/lava-dragon.png',
    motion: 'breath',
    avatarRatio: 0.62,
    featured: true
  },
  {
    id: 'pearl-wings',
    name: '珍珠羽翼',
    description: '珍珠圆环与羽翼图片框，柔和轻奢。',
    tags: ['图片框', '羽翼', '宝石', '华丽'],
    variant: 'image-frame',
    image: '/avatar-frames/pearl-wings.png',
    motion: 'breath',
    avatarRatio: 0.64,
    featured: true
  },
  {
    id: 'jade-bamboo',
    name: '青玉竹环',
    description: '青绿色竹叶图片框，清新自然。',
    tags: ['图片框', '竹叶', '自然', '清新'],
    variant: 'image-frame',
    image: '/avatar-frames/jade-bamboo.png',
    motion: 'breath',
    avatarRatio: 0.64,
    featured: true
  },
  {
    id: 'purple-magic',
    name: '紫晶魔法',
    description: '紫色魔法晶环图片框，梦幻感更强。',
    tags: ['图片框', '魔法', '宝石', '梦幻'],
    variant: 'image-frame',
    image: '/avatar-frames/purple-magic.png',
    motion: 'slow-spin',
    avatarRatio: 0.64,
    featured: true
  },
  {
    id: 'none',
    name: '无特效',
    description: '不使用头像框。',
    tags: ['简约'],
    variant: 'none',
    avatarRatio: 1
  }
])

export const AVATAR_FRAME_CONFIGS = Object.freeze(
  Object.fromEntries(AVATAR_FRAME_OPTIONS.map((frame) => [frame.id, frame]))
)

export const normalizeAvatarFrameId = (frameId, fallback = DEFAULT_AVATAR_FRAME) => {
  const rawFrameId = String(frameId || '').trim()
  if (!rawFrameId) return fallback
  if (AVATAR_FRAME_CONFIGS[rawFrameId]) return rawFrameId
  const mapped = LEGACY_AVATAR_FRAME_MAP[rawFrameId]
  if (mapped && AVATAR_FRAME_CONFIGS[mapped]) return mapped
  return fallback
}

export const getAvatarFrameConfig = (frameId, fallback = DEFAULT_AVATAR_FRAME) => {
  const normalizedFrameId = normalizeAvatarFrameId(frameId, fallback)
  return AVATAR_FRAME_CONFIGS[normalizedFrameId] || AVATAR_FRAME_CONFIGS[fallback] || AVATAR_FRAME_CONFIGS.none
}

/** 头像相对外框尺寸比例 */
export const getAvatarInnerRatio = (frame) => {
  if (!frame || frame.variant === 'none') return 1
  if (typeof frame.avatarRatio === 'number') return frame.avatarRatio
  return frame.variant === 'image-frame' ? 0.64 : 0.78
}
