export const DEFAULT_AVATAR_FRAME = 'festival-lantern'

export const AVATAR_FRAME_OPTIONS = Object.freeze([
  {
    id: 'festival-lantern',
    name: '锦灯瑞环',
    description: '金红描边、花簇和灯笼点缀，适合醒目的节庆风头像',
    tags: ['国风', '节庆'],
    variant: 'festival-lantern',
    featured: true
  },
  {
    id: 'aurora-butterfly',
    name: '星蝶流光',
    description: '紫蓝晶环与轻盈蝶翼环绕，带柔和星光闪烁',
    tags: ['华丽', '自然'],
    variant: 'aurora-butterfly',
    featured: true
  },
  {
    id: 'laurel-medal',
    name: '金桂勋章',
    description: '金色圆框、桂冠和底座组合，更像正式头像徽章',
    tags: ['桂冠', '金色'],
    variant: 'laurel-medal',
    featured: true
  },
  {
    id: 'live-crown',
    name: '霓虹直播',
    description: '皇冠、LIVE 标识和霓虹能量环，适合更活跃的展示风格',
    tags: ['直播', '霓虹', '科技'],
    variant: 'live-crown',
    featured: true
  },
  {
    id: 'galaxy-orbit',
    name: '星河轨道',
    description: '深色星环、轨道和微光星点，带空间感的动态框',
    tags: ['星河', '科技'],
    variant: 'galaxy-orbit',
    featured: true
  },
  {
    id: 'crown-gem',
    name: '皇冠宝石',
    description: '青绿色光环、皇冠和宝石底饰，轻奢但不刺眼',
    tags: ['皇冠', '宝石', '华丽'],
    variant: 'crown-gem',
    featured: true
  },
  {
    id: 'none',
    name: '无特效',
    description: '不使用动态头像框',
    tags: ['简约'],
    variant: 'none'
  }
])

export const AVATAR_FRAME_CONFIGS = Object.freeze(
  Object.fromEntries(AVATAR_FRAME_OPTIONS.map((frame) => [frame.id, frame]))
)

export const normalizeAvatarFrameId = (frameId, fallback = DEFAULT_AVATAR_FRAME) => {
  const rawFrameId = String(frameId || '').trim()
  if (!rawFrameId) return fallback
  return AVATAR_FRAME_CONFIGS[rawFrameId] ? rawFrameId : fallback
}

export const getAvatarFrameConfig = (frameId, fallback = DEFAULT_AVATAR_FRAME) => {
  const normalizedFrameId = normalizeAvatarFrameId(frameId, fallback)
  return AVATAR_FRAME_CONFIGS[normalizedFrameId] || AVATAR_FRAME_CONFIGS[fallback] || AVATAR_FRAME_CONFIGS.none
}
