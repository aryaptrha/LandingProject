<script setup lang="ts">
import MenuCard from './components/MenuCard.vue'
import CloudflareEdgeStatus from './components/CloudflareEdgeStatus.vue'
import EdgeGuestbook from './components/EdgeGuestbook.vue'
import EdgeInsights from './components/EdgeInsights.vue'
import EdgeNetworkVisualization from './components/EdgeNetworkVisualization.vue'
import LatencyIndicator from './components/LatencyIndicator.vue'
import ChatContainer from './components/chat/ChatContainer.vue'
import MusicPlayerWidget from './components/music/MusicPlayerWidget.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import IconGameDev from './components/icons/IconGameDev.vue'
import IconBackend from './components/icons/IconBackend.vue'
import IconMobile from './components/icons/IconMobile.vue'
import IconDesign from './components/icons/IconDesign.vue'
import IconOpenSource from './components/icons/IconOpenSource.vue'

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

        <EdgeNetworkVisualization class="grid-spacing" />

        <!--
          Below the network map on purpose: that panel shows the edge is there, and
          these two show it doing something durable. Guestbook first, because it is
          the one a visitor can interact with; insights second, because it is partly
          a readout of that interaction.
        -->
        <EdgeGuestbook class="grid-spacing" />
        <EdgeInsights class="grid-spacing" />
      </section>
    </main>
  </div>

  <!-- Floating Widgets -->
  <ThemeToggle />
  <ChatContainer />
  <!--
    These two share a rail so they lay each other out. The edge panel collapses to a chip
    now, and a flex row is what lets the latency meter slide over to meet it instead of
    being left beside a gap — it used to hardcode the panel's 260px width into its own
    `right` offset, which quietly assumed the panel was always open. Latency first, so it
    stays on the panel's left as before.
  -->
  <div class="widget-rail">
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
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
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
