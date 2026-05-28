<template>
  <div
    class="decorative-avatar-frame"
    :class="[variantClass, { 'is-none': variant === 'none' }]"
    :style="frameStyle"
  >
    <template v-if="variant !== 'none'">
      <div class="frame-glow" aria-hidden="true"></div>
      <div class="frame-ring ring-main" aria-hidden="true"></div>
      <div class="frame-ring ring-secondary" aria-hidden="true"></div>

      <div class="frame-sparkles" aria-hidden="true">
        <i v-for="index in 10" :key="index" :style="{ '--i': index }"></i>
      </div>

      <div class="festival-flower flower-bottom" aria-hidden="true">
        <span v-for="index in 6" :key="index"></span>
      </div>
      <div class="festival-lantern" aria-hidden="true">
        <span></span>
        <span></span>
      </div>

      <div class="butterfly butterfly-left" aria-hidden="true">
        <span v-for="index in 4" :key="index"></span>
      </div>
      <div class="butterfly butterfly-right" aria-hidden="true">
        <span v-for="index in 4" :key="index"></span>
      </div>

      <div class="laurel laurel-left" aria-hidden="true">
        <i v-for="index in 7" :key="index"></i>
      </div>
      <div class="laurel laurel-right" aria-hidden="true">
        <i v-for="index in 7" :key="index"></i>
      </div>
      <div class="frame-nameplate" aria-hidden="true"></div>

      <div class="frame-crown" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="live-ribbon" aria-hidden="true">LIVE</div>

      <div class="galaxy-orbit orbit-one" aria-hidden="true"></div>
      <div class="galaxy-orbit orbit-two" aria-hidden="true"></div>
      <div class="planet planet-one" aria-hidden="true"></div>
      <div class="planet planet-two" aria-hidden="true"></div>

      <div class="gem-wings wing-left" aria-hidden="true"></div>
      <div class="gem-wings wing-right" aria-hidden="true"></div>
      <div class="frame-gem" aria-hidden="true"></div>
    </template>

    <el-avatar
      :size="avatarSize"
      :src="avatar || defaultAvatar"
      class="decorative-avatar"
      @error="handleError"
    >
      {{ fallbackInitial }}
    </el-avatar>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  frame: {
    type: Object,
    default: null
  },
  avatar: {
    type: String,
    default: ''
  },
  name: {
    type: String,
    default: ''
  },
  size: {
    type: Number,
    default: 140
  },
  avatarSize: {
    type: Number,
    default: 100
  },
  defaultAvatar: {
    type: String,
    default: '/default-avatar.webp'
  }
})

const emit = defineEmits(['avatar-error'])

const variant = computed(() => props.frame?.variant || 'none')
const variantClass = computed(() => `frame-${variant.value}`)
const frameStyle = computed(() => ({
  '--frame-size': `${props.size}px`,
  '--avatar-size': `${props.avatarSize}px`
}))
const fallbackInitial = computed(() => {
  return props.name ? props.name.slice(0, 1).toUpperCase() : 'U'
})

function handleError() {
  emit('avatar-error')
}
</script>

<style scoped>
.decorative-avatar-frame {
  --frame-size: 140px;
  --avatar-size: 100px;
  --ring-thickness: max(5px, calc(var(--frame-size) * 0.05));
  --frame-gold: var(--ds-yellow);
  --frame-gold-soft: var(--ds-yellow-bg);
  --frame-gold-strong: var(--ds-yellow-strong);
  --frame-red: var(--ds-red);
  --frame-red-soft: var(--ds-red-bg);
  --frame-red-strong: var(--ds-red-strong);
  --frame-blue: var(--ds-blue);
  --frame-blue-soft: var(--ds-blue-bg);
  --frame-blue-strong: var(--ds-blue-strong);
  --frame-cyan: var(--color-info, var(--ds-blue));
  --frame-green: var(--ds-green);
  --frame-purple: var(--ds-purple);
  --frame-purple-strong: var(--ds-purple-strong);
  --frame-pink: var(--ds-pink);
  --frame-surface: var(--color-bg-base);
  position: relative;
  width: var(--frame-size);
  height: var(--frame-size);
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--frame-size);
  line-height: 1;
  vertical-align: middle;
  overflow: visible;
  isolation: isolate;
}

.decorative-avatar-frame *,
.decorative-avatar-frame *::before,
.decorative-avatar-frame *::after {
  box-sizing: border-box;
}

.decorative-avatar {
  position: relative;
  z-index: 10;
  width: var(--avatar-size) !important;
  height: var(--avatar-size) !important;
  flex: 0 0 var(--avatar-size);
  border: 4px solid var(--el-bg-color);
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: calc(var(--avatar-size) * 0.32);
  box-shadow: 0 2px 12px color-mix(in srgb, var(--color-text-primary) 10%, transparent);
}

:deep(.decorative-avatar img) {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.frame-glow,
.frame-ring,
.frame-sparkles,
.festival-flower,
.festival-lantern,
.butterfly,
.laurel,
.frame-nameplate,
.frame-crown,
.live-ribbon,
.galaxy-orbit,
.planet,
.gem-wings,
.frame-gem {
  display: none;
  position: absolute;
  pointer-events: none;
}

.frame-glow {
  inset: 8%;
  z-index: 0;
  border-radius: 50%;
  filter: none;
  opacity: 0.16;
  animation: avatarFrameGlow 2.8s ease-in-out infinite;
}

.frame-ring {
  inset: 8%;
  z-index: 4;
  border-radius: 50%;
}

.ring-main {
  background: conic-gradient(from 0deg, var(--frame-gold), var(--frame-pink), var(--frame-blue), var(--frame-cyan), var(--frame-gold));
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - var(--ring-thickness)), var(--ds-black) calc(100% - var(--ring-thickness)));
  mask: radial-gradient(farthest-side, transparent calc(100% - var(--ring-thickness)), var(--ds-black) calc(100% - var(--ring-thickness)));
  animation: avatarFrameSpin 7.5s linear infinite;
}

.ring-secondary {
  inset: 14%;
  z-index: 3;
  border: 1px solid color-mix(in srgb, var(--frame-surface) 75%, transparent);
  opacity: 0.7;
  animation: avatarFrameBreath 2.6s ease-in-out infinite;
}

.frame-sparkles {
  inset: 2%;
  z-index: 7;
}

.frame-sparkles i {
  --i: 0;
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  color: color-mix(in srgb, var(--frame-surface) 95%, transparent);
  box-shadow: none;
  transform: rotate(calc(var(--i) * 36deg)) translateX(calc(var(--frame-size) * 0.45));
  animation: avatarFrameSparkle 1.8s ease-in-out infinite;
  animation-delay: calc(var(--i) * -0.13s);
}

.frame-festival-lantern .frame-glow,
.frame-festival-lantern .frame-ring,
.frame-festival-lantern .frame-sparkles,
.frame-festival-lantern .festival-flower,
.frame-festival-lantern .festival-lantern {
  display: block;
}

.frame-festival-lantern .frame-glow {
  background: radial-gradient(circle, color-mix(in srgb, var(--frame-red) 45%, transparent), color-mix(in srgb, var(--frame-gold) 12%, transparent), transparent 70%);
}

.frame-festival-lantern .ring-main {
  background: conic-gradient(from 20deg, var(--frame-red-strong), var(--frame-gold), var(--frame-red), var(--frame-gold), var(--frame-red-strong));
}

.festival-flower {
  width: 26%;
  height: 26%;
  z-index: 9;
}

.festival-flower span {
  position: absolute;
  width: 34%;
  height: 34%;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--frame-red), var(--frame-red-strong));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--frame-gold-soft) 75%, transparent);
}

.festival-flower span:nth-child(1) { left: 34%; top: 0; }
.festival-flower span:nth-child(2) { right: 0; top: 32%; }
.festival-flower span:nth-child(3) { left: 34%; bottom: 0; }
.festival-flower span:nth-child(4) { left: 0; top: 32%; }
.festival-flower span:nth-child(5) { left: 33%; top: 33%; background: var(--frame-gold); }
.festival-flower span:nth-child(6) {
  left: -18%;
  bottom: -8%;
  width: 64%;
  height: 20%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--frame-gold), var(--frame-red-strong));
  transform: rotate(-32deg);
}

.flower-bottom {
  left: 4%;
  bottom: 8%;
  transform: rotate(-18deg);
  animation: avatarFrameFlower 2.8s ease-in-out infinite;
}

.festival-lantern {
  right: 12%;
  top: 9%;
  z-index: 9;
  width: 24%;
  height: 24%;
  transform-origin: 50% 0;
  animation: avatarFrameLantern 2.4s ease-in-out infinite;
}

.festival-lantern::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -22%;
  width: 1px;
  height: 36%;
  background: color-mix(in srgb, var(--frame-red-strong) 55%, transparent);
}

.festival-lantern span {
  position: absolute;
  width: 54%;
  height: 54%;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--frame-red), var(--frame-red-strong));
  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--frame-gold) 55%, transparent);
}

.festival-lantern span:nth-child(1) {
  left: 2%;
  top: 20%;
}

.festival-lantern span:nth-child(2) {
  right: 0;
  bottom: 2%;
  transform: scale(0.82);
}

.frame-aurora-butterfly .frame-glow,
.frame-aurora-butterfly .frame-ring,
.frame-aurora-butterfly .frame-sparkles,
.frame-aurora-butterfly .butterfly {
  display: block;
}

.frame-aurora-butterfly .frame-glow {
  background: radial-gradient(circle, color-mix(in srgb, var(--frame-purple) 42%, transparent), color-mix(in srgb, var(--frame-blue) 14%, transparent), transparent 72%);
}

.frame-aurora-butterfly .ring-main {
  background: conic-gradient(from 90deg, var(--frame-purple), var(--frame-blue), var(--frame-pink), var(--frame-purple-strong), var(--frame-purple));
}

.butterfly {
  z-index: 9;
  width: 22%;
  height: 20%;
}

.butterfly-left {
  left: 7%;
  bottom: 20%;
  transform: rotate(-18deg);
  animation: avatarFrameButterflyLeft 2.4s ease-in-out infinite;
}

.butterfly-right {
  right: 8%;
  top: 18%;
  transform: rotate(20deg) scale(0.8);
  animation: avatarFrameButterflyRight 2.2s ease-in-out infinite;
}

.butterfly span {
  position: absolute;
  width: 42%;
  height: 48%;
  border-radius: 60% 60% 45% 45%;
  background: linear-gradient(135deg, color-mix(in srgb, var(--frame-surface) 95%, transparent), color-mix(in srgb, var(--frame-blue) 72%, transparent), color-mix(in srgb, var(--frame-purple) 82%, transparent));
  box-shadow: none;
}

.butterfly span:nth-child(1) { left: 7%; top: 0; transform: rotate(-30deg); }
.butterfly span:nth-child(2) { right: 7%; top: 0; transform: rotate(30deg); }
.butterfly span:nth-child(3) { left: 16%; bottom: 0; transform: rotate(28deg) scale(0.72); }
.butterfly span:nth-child(4) { right: 16%; bottom: 0; transform: rotate(-28deg) scale(0.72); }

.frame-laurel-medal .frame-glow,
.frame-laurel-medal .frame-ring,
.frame-laurel-medal .laurel,
.frame-laurel-medal .frame-nameplate {
  display: block;
}

.frame-laurel-medal .frame-glow {
  background: radial-gradient(circle, color-mix(in srgb, var(--frame-gold) 34%, transparent), color-mix(in srgb, var(--frame-gold-soft) 18%, transparent), transparent 68%);
}

.frame-laurel-medal .ring-main {
  background: conic-gradient(from 180deg, var(--frame-gold-strong), var(--frame-gold), var(--ds-orange), var(--frame-gold-soft), var(--frame-gold-strong));
}

.laurel {
  top: 25%;
  z-index: 8;
  width: 18%;
  height: 50%;
}

.laurel-left { left: 8%; transform: rotate(-18deg); }
.laurel-left { animation: avatarFrameLaurelLeft 3s ease-in-out infinite; }
.laurel-right { right: 8%; transform: scaleX(-1) rotate(-18deg); }
.laurel-right { animation: avatarFrameLaurelRight 3s ease-in-out infinite; }

.laurel i {
  position: absolute;
  left: 42%;
  width: 42%;
  height: 16%;
  border-radius: 100% 0 100% 0;
  background: linear-gradient(135deg, var(--frame-gold), var(--frame-gold-strong));
  transform-origin: left bottom;
  box-shadow: none;
}

.laurel i:nth-child(1) { top: 0; transform: rotate(-44deg); }
.laurel i:nth-child(2) { top: 12%; transform: rotate(-34deg); }
.laurel i:nth-child(3) { top: 24%; transform: rotate(-24deg); }
.laurel i:nth-child(4) { top: 36%; transform: rotate(-14deg); }
.laurel i:nth-child(5) { top: 48%; transform: rotate(-4deg); }
.laurel i:nth-child(6) { top: 60%; transform: rotate(8deg); }
.laurel i:nth-child(7) { top: 72%; transform: rotate(18deg); }

.frame-nameplate {
  left: 50%;
  bottom: 5%;
  z-index: 9;
  width: 44%;
  height: 13%;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--frame-gold-soft), var(--ds-orange));
  box-shadow: none;
  transform: translateX(-50%);
  animation: avatarFrameNameplate 2.8s ease-in-out infinite;
}

.frame-live-crown .frame-glow,
.frame-live-crown .frame-ring,
.frame-live-crown .frame-sparkles,
.frame-live-crown .frame-crown,
.frame-live-crown .live-ribbon {
  display: block;
}

.frame-live-crown .frame-glow {
  background: radial-gradient(circle, color-mix(in srgb, var(--frame-cyan) 35%, transparent), color-mix(in srgb, var(--frame-purple) 18%, transparent), transparent 72%);
}

.frame-live-crown .ring-main {
  background: conic-gradient(from 0deg, var(--frame-cyan), var(--frame-purple), var(--frame-pink), var(--frame-cyan));
}

.frame-crown {
  left: 50%;
  top: 3%;
  z-index: 9;
  width: 30%;
  height: 20%;
  transform: translateX(-50%);
  animation: avatarFrameCrown 2.6s ease-in-out infinite;
}

.frame-crown::after {
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: 12%;
  height: 24%;
  border-radius: 999px 999px 4px 4px;
  background: linear-gradient(135deg, var(--frame-gold-soft), var(--frame-gold));
}

.frame-crown span {
  position: absolute;
  bottom: 25%;
  width: 34%;
  height: 58%;
  background: linear-gradient(135deg, var(--frame-gold), var(--ds-orange));
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}

.frame-crown span:nth-child(1) { left: 0; transform: rotate(-10deg); }
.frame-crown span:nth-child(2) { left: 33%; height: 72%; }
.frame-crown span:nth-child(3) { right: 0; transform: rotate(10deg); }

.live-ribbon {
  left: 50%;
  bottom: 3%;
  z-index: 9;
  min-width: 44%;
  padding: 3px 10px;
  border-radius: 999px;
  color: var(--el-color-white);
  background: linear-gradient(135deg, var(--frame-purple), var(--frame-red));
  font-size: max(10px, calc(var(--frame-size) * 0.09));
  font-weight: 800;
  letter-spacing: 0;
  box-shadow: none;
  transform: translateX(-50%);
  animation: avatarFrameRibbon 1.5s ease-in-out infinite;
}

.frame-galaxy-orbit .frame-glow,
.frame-galaxy-orbit .frame-ring,
.frame-galaxy-orbit .frame-sparkles,
.frame-galaxy-orbit .galaxy-orbit,
.frame-galaxy-orbit .planet {
  display: block;
}

.frame-galaxy-orbit .frame-glow {
  background: radial-gradient(circle, color-mix(in srgb, var(--frame-blue) 36%, transparent), color-mix(in srgb, var(--color-text-primary) 18%, transparent), transparent 74%);
}

.frame-galaxy-orbit .ring-main {
  background: conic-gradient(from 45deg, var(--color-text-primary), var(--frame-blue), var(--color-bg-section), var(--frame-purple), var(--color-text-primary));
}

.galaxy-orbit {
  left: 50%;
  top: 50%;
  z-index: 6;
  width: 84%;
  height: 48%;
  border: 1px solid color-mix(in srgb, var(--frame-blue-soft) 78%, transparent);
  border-radius: 50%;
  transform: translate(-50%, -50%) rotate(-18deg);
  transform-origin: center;
  animation: avatarFrameOrbitOne 8s linear infinite;
}

.orbit-two {
  transform: translate(-50%, -50%) rotate(58deg);
  opacity: 0.58;
  animation: avatarFrameOrbitTwo 10s linear infinite reverse;
}

.planet {
  z-index: 9;
  width: 8%;
  height: 8%;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, var(--frame-surface), var(--frame-blue) 45%, var(--frame-blue-strong));
  box-shadow: none;
}

.planet-one { left: 14%; top: 20%; }
.planet-one { animation: avatarFramePlanetOne 3.2s ease-in-out infinite; }
.planet-two { right: 15%; bottom: 18%; transform: scale(0.72); }
.planet-two { animation: avatarFramePlanetTwo 3.6s ease-in-out infinite; }

.frame-crown-gem .frame-glow,
.frame-crown-gem .frame-ring,
.frame-crown-gem .frame-sparkles,
.frame-crown-gem .frame-crown,
.frame-crown-gem .gem-wings,
.frame-crown-gem .frame-gem {
  display: block;
}

.frame-crown-gem .frame-glow {
  background: radial-gradient(circle, color-mix(in srgb, var(--frame-cyan) 38%, transparent), color-mix(in srgb, var(--frame-gold) 14%, transparent), transparent 72%);
}

.frame-crown-gem .ring-main {
  background: conic-gradient(from 120deg, var(--frame-cyan), var(--frame-green), var(--frame-gold), var(--frame-cyan));
}

.gem-wings {
  top: 56%;
  z-index: 8;
  width: 26%;
  height: 16%;
  background: linear-gradient(135deg, color-mix(in srgb, var(--frame-cyan) 85%, transparent), color-mix(in srgb, var(--frame-purple) 70%, transparent));
  clip-path: polygon(0 50%, 100% 0, 74% 50%, 100% 100%);
  filter: none;
}

.wing-left { left: 4%; transform: rotate(12deg); }
.wing-left { animation: avatarFrameWingLeft 2.4s ease-in-out infinite; }
.wing-right { right: 4%; transform: scaleX(-1) rotate(12deg); }
.wing-right { animation: avatarFrameWingRight 2.4s ease-in-out infinite; }

.frame-gem {
  left: 50%;
  bottom: 4%;
  z-index: 9;
  width: 21%;
  height: 17%;
  background: linear-gradient(135deg, var(--color-bg-base), var(--frame-cyan) 55%, var(--color-primary-dark-2, var(--color-primary)));
  clip-path: polygon(22% 0, 78% 0, 100% 38%, 50% 100%, 0 38%);
  box-shadow: none;
  transform: translateX(-50%);
  animation: avatarFrameGem 2.2s ease-in-out infinite;
}

.frame-none .decorative-avatar {
  box-shadow: 0 2px 12px color-mix(in srgb, var(--color-text-primary) 8%, transparent);
}

@keyframes avatarFrameSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes avatarFrameGlow {
  0%, 100% { opacity: 0.12; transform: scale(0.96); }
  50% { opacity: 0.28; transform: scale(1.06); }
}

@keyframes avatarFrameBreath {
  0%, 100% { opacity: 0.45; transform: scale(0.98); }
  50% { opacity: 0.85; transform: scale(1.04); }
}

@keyframes avatarFrameSparkle {
  0%, 100% { opacity: 0.22; transform: rotate(calc(var(--i) * 36deg)) translateX(calc(var(--frame-size) * 0.43)) scale(0.75); }
  45% { opacity: 1; transform: rotate(calc(var(--i) * 36deg + 10deg)) translateX(calc(var(--frame-size) * 0.47)) scale(1.35); }
}

@keyframes avatarFrameLantern {
  0%, 100% { transform: rotate(-4deg) translateY(0); }
  50% { transform: rotate(5deg) translateY(3px); }
}

@keyframes avatarFrameFlower {
  0%, 100% { transform: rotate(-18deg) scale(1); }
  50% { transform: rotate(-10deg) scale(1.08); }
}

@keyframes avatarFrameButterflyLeft {
  0%, 100% { transform: rotate(-18deg) translateY(0) scale(1); }
  50% { transform: rotate(-8deg) translateY(-5px) scale(1.08); }
}

@keyframes avatarFrameButterflyRight {
  0%, 100% { transform: rotate(20deg) translateY(0) scale(0.8); }
  50% { transform: rotate(10deg) translateY(5px) scale(0.9); }
}

@keyframes avatarFrameLaurelLeft {
  0%, 100% { transform: rotate(-18deg) translateY(0); }
  50% { transform: rotate(-12deg) translateY(-2px); }
}

@keyframes avatarFrameLaurelRight {
  0%, 100% { transform: scaleX(-1) rotate(-18deg) translateY(0); }
  50% { transform: scaleX(-1) rotate(-12deg) translateY(-2px); }
}

@keyframes avatarFrameNameplate {
  0%, 100% { transform: translateX(-50%) scale(1); }
  50% { transform: translateX(-50%) scale(1.05); }
}

@keyframes avatarFrameCrown {
  0%, 100% { transform: translateX(-50%) translateY(0) rotate(0deg); }
  50% { transform: translateX(-50%) translateY(-3px) rotate(2deg); }
}

@keyframes avatarFrameRibbon {
  0%, 100% { transform: translateX(-50%) scale(1); }
  50% { transform: translateX(-50%) scale(1.06); }
}

@keyframes avatarFrameOrbitOne {
  from { transform: translate(-50%, -50%) rotate(-18deg); }
  to { transform: translate(-50%, -50%) rotate(342deg); }
}

@keyframes avatarFrameOrbitTwo {
  from { transform: translate(-50%, -50%) rotate(58deg); }
  to { transform: translate(-50%, -50%) rotate(418deg); }
}

@keyframes avatarFramePlanetOne {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-5px) scale(1.1); }
}

@keyframes avatarFramePlanetTwo {
  0%, 100% { transform: translateY(0) scale(0.72); }
  50% { transform: translateY(5px) scale(0.84); }
}

@keyframes avatarFrameWingLeft {
  0%, 100% { transform: rotate(12deg) scaleX(1); }
  50% { transform: rotate(20deg) scaleX(0.88); }
}

@keyframes avatarFrameWingRight {
  0%, 100% { transform: scaleX(-1) rotate(12deg); }
  50% { transform: scaleX(-0.88) rotate(20deg); }
}

@keyframes avatarFrameGem {
  0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
  50% { transform: translateX(-50%) translateY(-4px) scale(1.08); }
}

@media (prefers-reduced-motion: reduce) {
  .decorative-avatar-frame *,
  .decorative-avatar-frame *::before,
  .decorative-avatar-frame *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
