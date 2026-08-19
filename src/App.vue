<script setup lang="ts">
import { onMounted, defineAsyncComponent } from 'vue'
import { vAutoAnimate } from '@formkit/auto-animate/vue'
import { recordVisit } from './composables/useVisitLogger'
import MenuCard from './components/MenuCard.vue'
import CloudflareEdgeStatus from './components/CloudflareEdgeStatus.vue'
import LatencyIndicator from './components/LatencyIndicator.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import SoundToggle from './components/SoundToggle.vue'
import LazySection from './components/LazySection.vue'
import IconGameDev from './components/icons/IconGameDev.vue'
import IconBackend from './components/icons/IconBackend.vue'
import IconMobile from './components/icons/IconMobile.vue'
import IconDesign from './components/icons/IconDesign.vue'
import IconOpenSource from './components/icons/IconOpenSource.vue'

// Async-loaded heavy below-the-fold and floating components
const EdgeNetworkVisualization = defineAsyncComponent(() => import('./components/EdgeNetworkVisualization.vue'))
const EdgeGuestbook = defineAsyncComponent(() => import('./components/EdgeGuestbook.vue'))
const EdgeInsights = defineAsyncComponent(() => import('./components/EdgeInsights.vue'))
const ChatContainer = defineAsyncComponent(() => import('./components/chat/ChatContainer.vue'))
const MusicPlayerWidget = defineAsyncComponent(() => import('./components/music/MusicPlayerWidget.vue'))

const menuItems = [
  {
    title: 'Personal Website',
    description: 'A personal website built in HTML, CSS, and Vanilla JavaScript, showcasing my portfolio and projects. It is designed to be fast, responsive, and accessible.',
    icon: IconDesign,
    color: 'var(--pink-light)',
    link: 'https://aryaptrha.github.io/yaya/',
    disabled: false,
  },
  {
    title: 'Game Dev',
    description: 'I made this game for completing my bachelor thesis, and I\'ve been exploring game development ever since. Built with Unity and C#.',
    icon: IconGameDev,
    color: 'var(--yellow-light)',
    link: 'https://aryaptrha.itch.io/upi-cibiru-prototype',
    disabled: false,
  },
  {
    title: 'Kecha',
    description: 'A full-stack web application for my hobby project. Built with Next.js, TypeScript, Tailwind CSS, and Supabase, with a focus on real-time collaboration and user experience.',
    icon: IconBackend,
    color: 'var(--lavender-light)',
    link: 'https://kecha.vercel.app/',
    disabled: false,
  },
  {
    title: 'Basic CRUD Fullstack App',
    description: 'A simple full-stack application built with ASP.NET and SQL Server, demonstrating basic CRUD operations and authentication.',
    icon: IconMobile,
    color: 'var(--green-light)',
    link: 'https://learndeploy-azfwgzbngqebhwcr.southeastasia-01.azurewebsites.net',
    disabled: false,
  },
  {
    title: 'Soon',
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    icon: IconOpenSource,
    color: 'var(--green-light)',
    link: '',
    disabled: true,
  },
]

/*
 * design.md's motion budget is 150-200ms and rules out bounce; auto-animate defaults to
 * 250ms ease-in-out, hence the explicit duration. The easing only reaches the element that
 * *moves* — the latency meter. An arrival and a departure get `ease-in` and `ease-out`
 * hardcoded by the library, which is fine: both are plain fades with no overshoot, so
 * they're inside design.md's rules either way. auto-animate reads `prefers-reduced-motion`
 * itself and sits the whole thing out when it is set, so nothing here needs to check that.
 *
 * 200 rather than 150 because of how auto-animate spends it. An element leaving, and one
 * merely moving, take the full 200ms. An element *arriving* is given `duration * 1.5` —
 * 300ms — but its keyframes hold it at `opacity: 0` until the halfway mark, so what that
 * buys is a 150ms fade-in that starts once the outgoing element is most of the way gone,
 * rather than the two crossing over each other. Every visible movement therefore lands
 * inside the budget; the 300ms figure in devtools is half stillness. At 150 the arrival
 * would fade in over 112ms, which is under it.
 */
const railMotion = { duration: 200, easing: 'ease-out' }

onMounted(() => {
  if (typeof window === 'undefined') return
  const triggerVisit = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => recordVisit(), { timeout: 5000 })
    } else {
      setTimeout(recordVisit, 2000)
    }
  }

  if (document.readyState === 'complete') {
    setTimeout(triggerVisit, 2000)
  } else {
    window.addEventListener('load', () => setTimeout(triggerVisit, 2000), { once: true })
  }
})
</script>

<template>
  <div class="landing">
    <header class="landing__header">
      <h1 class="landing__title">aryaptrha Projects</h1>
      <p class="landing__subtitle">A cozy collection of things I've built and explored.</p>
    </header>

    <!-- Main Projects View -->
    <main class="landing__content">
      <section class="view-section">
        <div class="landing__grid" role="list">
          <div
            v-for="(item, index) in menuItems"
            :key="index"
          >
            <MenuCard
              :title="item.title"
              :description="item.description"
              :icon="item.icon"
              :color="item.color"
              :link="item.link"
              :disabled="item.disabled"
              role="listitem"
            />
          </div>
        </div>

        <!-- Heavy below-the-fold sections lazy loaded with zero-CLS skeleton fallback -->
        <LazySection
          min-height="480px"
          title="Edge Network Topology"
          class="grid-spacing"
        >
          <EdgeNetworkVisualization />
        </LazySection>

        <!--
          Below the network map on purpose: that panel shows the edge is there, and
          these two show it doing something durable. Guestbook first, because it is
          the one a visitor can interact with; insights second, because it is partly
          a readout of that interaction.
        -->
        <LazySection
          min-height="450px"
          title="Edge Guestbook"
          class="grid-spacing"
        >
          <EdgeGuestbook />
        </LazySection>

        <LazySection
          min-height="240px"
          title="Live Edge Insights"
          class="grid-spacing"
        >
          <EdgeInsights />
        </LazySection>
      </section>
    </main>
  </div>

  <!-- Floating Widgets -->
  <ThemeToggle />
  <SoundToggle />
  <ChatContainer />
  <!--
    These two share a rail so they lay each other out. The edge panel collapses to a chip
    now, and a flex row is what lets the latency meter slide over to meet it instead of
    being left beside a gap — it used to hardcode the panel's 260px width into its own
    `right` offset, which quietly assumed the panel was always open. Latency first, so it
    stays on the panel's left as before.

    auto-animate goes here rather than inside CloudflareEdgeStatus because collapsing is a
    change to *this* element's contents: the chip and the panel are two children swapped
    for one another, and the meter is a third child that moves when they are. Being a
    multi-root component, the edge widget's chip and panel are direct children of this
    rail, which is exactly what auto-animate needs. It pins the outgoing one in place and
    fades it, fades and scales the incoming one, and carries the meter across the distance
    the swap opened up — none of which the widget could do from inside itself, having no
    say over its siblings or over the rail's own geometry.
  -->
  <div class="widget-rail" v-auto-animate="railMotion">
    <LatencyIndicator />
    <CloudflareEdgeStatus />
  </div>
  <!--
    Last, and on z-index 1001: this is the one widget a visitor can park anywhere, so
    it has to win over the fixed-corner widgets it may be dragged across rather than
    end up half-buried under one. That beats the latency and edge-status widgets on
    z-index alone; against ThemeToggle and the chat launcher, both also on 1001, it is
    this position in DOM order that settles the tie — so keep it last.
  -->
  <MusicPlayerWidget />
</template>

<style scoped>
.landing {
  padding: var(--space-2xl) 0;
}

/*
 * The bottom-right corner, shared. Sized to its contents so it claims no more of the
 * screen than the widgets in it, and `flex-end` keeps the short latency meter sitting on
 * the same baseline as the tall edge panel. Anything hidden — the meter below 768px, the
 * panel while collapsed — drops out of the flow and the rail shrinks to what's left.
 */
.widget-rail {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  gap: var(--space-sm);
  /* The rail is as tall as its tallest child, which leaves dead space above the shorter
     one. Without this, that space would swallow clicks meant for the page behind it; each
     child takes pointer events back for itself. */
  pointer-events: none;
}

.landing__header {
  text-align: center;
  margin-bottom: var(--space-2xl);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.landing__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 2.4rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: var(--space-xs);
}

.landing__subtitle {
  font-size: 1.05rem;
  color: var(--text-medium);
  margin-bottom: var(--space-lg);
}

.landing__content {
  width: 100%;
}

.view-section {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.landing__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-lg);
}

.grid-spacing {
  margin-top: var(--space-2xl);
}

@media (min-width: 768px) {
  .landing__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .landing__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
