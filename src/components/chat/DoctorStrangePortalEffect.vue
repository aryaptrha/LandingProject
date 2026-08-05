<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  originX?: number
  originY?: number
}>()

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isVisible = ref(true)
let animationFrameId: number | null = null

interface SparkParticle {
  angle: number
  radius: number
  size: number
  speed: number
  radialSpeed: number
  life: number
  maxLife: number
  color: string
}

const SPARK_COLORS = ['#FFD700', '#FF8C00', '#FF4500', '#FFA500', '#FFF700', '#FF3300']

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Resize canvas to parent dimensions
  const rect = canvas.parentElement?.getBoundingClientRect()
  const width = rect?.width || 360
  const height = rect?.height || 500
  canvas.width = width
  canvas.height = height

  const centerX = props.originX ?? width / 2
  const centerY = props.originY ?? height / 2

  let portalRadius = 5
  const maxPortalRadius = Math.min(width, height) * 0.34
  let portalAngle = 0

  const particles: SparkParticle[] = []

  function createSpark(r: number, angleOffset = 0): SparkParticle {
    const angle = Math.random() * Math.PI * 2 + angleOffset
    return {
      angle,
      radius: r + (Math.random() - 0.5) * 10,
      size: Math.random() * 3 + 1.5,
      speed: (Math.random() - 0.5) * 0.08,
      radialSpeed: Math.random() * 1.6 + 0.6,
      life: 0,
      maxLife: Math.random() * 35 + 20,
      color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)] || '#FFD700',
    }
  }

  const startTime = Date.now()
  const duration = 3000 // 3.0 seconds total

  function render() {
    if (!ctx || !canvas) return
    const elapsed = Date.now() - startTime

    if (elapsed >= duration) {
      isVisible.value = false
      setTimeout(() => {
        emit('complete')
      }, 350)
      return
    }

    ctx.clearRect(0, 0, width, height)

    // Easing calculation for smooth portal opening, holding, and closing
    const progress = elapsed / duration
    let globalAlpha = 1

    if (progress < 0.25) {
      // Smooth Expand (ease-out cubic)
      const t = progress / 0.25
      const easeOut = 1 - Math.pow(1 - t, 3)
      portalRadius = easeOut * maxPortalRadius
    } else if (progress > 0.65) {
      // Smooth Contract & Fade Out (ease-in cubic)
      const t = (progress - 0.65) / 0.35
      const easeIn = 1 - Math.pow(t, 2)
      portalRadius = Math.max(0, easeIn * maxPortalRadius)
      globalAlpha = Math.max(0, easeIn)
    } else {
      // Hold & Pulse
      portalRadius = maxPortalRadius + Math.sin(elapsed * 0.008) * 3
    }

    portalAngle += 0.06

    // Dark cosmic portal center with glow
    if (portalRadius > 2 && globalAlpha > 0.01) {
      ctx.save()
      ctx.globalAlpha = globalAlpha
      ctx.beginPath()
      ctx.arc(centerX, centerY, portalRadius, 0, Math.PI * 2)
      
      const portalGrad = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, portalRadius
      )
      portalGrad.addColorStop(0, `rgba(10, 5, 25, ${0.95 * globalAlpha})`)
      portalGrad.addColorStop(0.7, `rgba(30, 15, 50, ${0.85 * globalAlpha})`)
      portalGrad.addColorStop(1, `rgba(255, 140, 0, ${0.6 * globalAlpha})`)
      
      ctx.fillStyle = portalGrad
      ctx.fill()

      // Inner Eldritch Tao Mandala Ring
      ctx.strokeStyle = `rgba(255, 215, 0, ${Math.min(1, progress * 4) * globalAlpha})`
      ctx.lineWidth = 2
      ctx.stroke()

      // Concentric geometry lines
      ctx.beginPath()
      ctx.arc(centerX, centerY, portalRadius * 0.65, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255, 140, 0, ${0.7 * globalAlpha})`
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Spinning Tao Mandala square / star
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(portalAngle)
      const squareSize = portalRadius * 0.8
      ctx.strokeStyle = `rgba(255, 215, 0, ${0.6 * globalAlpha})`
      ctx.lineWidth = 1
      ctx.strokeRect(-squareSize / 2, -squareSize / 2, squareSize, squareSize)
      ctx.rotate(Math.PI / 4)
      ctx.strokeRect(-squareSize / 2, -squareSize / 2, squareSize, squareSize)
      ctx.restore()

      ctx.restore()
    }

    // Spawn sparks continuously during active phase, tapering off during outro
    if (progress < 0.7) {
      const spawnCount = Math.floor(Math.random() * (progress > 0.6 ? 3 : 7)) + 3
      for (let i = 0; i < spawnCount; i++) {
        particles.push(createSpark(portalRadius, portalAngle))
      }
    }

    // Update and draw spark particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      if (!p) continue

      p.life++
      p.angle += p.speed
      p.radius += p.radialSpeed * 0.4

      if (p.life >= p.maxLife) {
        particles.splice(i, 1)
        continue
      }

      const px = centerX + Math.cos(p.angle) * p.radius
      const py = centerY + Math.sin(p.angle) * p.radius
      const alpha = (1 - p.life / p.maxLife) * globalAlpha

      if (alpha > 0.01) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(px, py, p.size * (1 - p.life / p.maxLife), 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.shadowColor = '#FF8C00'
        ctx.shadowBlur = 8
        ctx.globalAlpha = alpha
        ctx.fill()
        ctx.restore()
      }
    }

    animationFrameId = requestAnimationFrame(render)
  }

  render()
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
})
</script>

<template>
  <Transition name="portal-outro-fade">
    <div v-if="isVisible" class="dr-strange-portal-overlay">
      <canvas ref="canvasRef" class="portal-canvas"></canvas>
    </div>
  </Transition>
</template>

<style scoped>
.dr-strange-portal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  pointer-events: none;
  overflow: hidden;
}

.portal-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* Vue Outro Transition */
.portal-outro-fade-leave-active {
  transition: opacity 0.4s ease-out;
}

.portal-outro-fade-leave-to {
  opacity: 0;
}
</style>
