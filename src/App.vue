<script setup lang="ts">
import MenuCard from './components/MenuCard.vue'
import CloudflareEdgeStatus from './components/CloudflareEdgeStatus.vue'
import EdgeNetworkVisualization from './components/EdgeNetworkVisualization.vue'
import LatencyIndicator from './components/LatencyIndicator.vue'
import ChatContainer from './components/chat/ChatContainer.vue'
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
    color: '#FCE6EC',
    link: 'https://aryaptrha.github.io/yaya/',
    disabled: false,
  },
  {
    title: 'Game Dev',
    description: 'I made this game for completing my bachelor thesis, and I\'ve been exploring game development ever since. Built with Unity and C#.',
    icon: IconGameDev,
    color: '#FCF5D6',
    link: 'https://aryaptrha.itch.io/upi-cibiru-prototype',
    disabled: false,
  },
  {
    title: 'Kecha',
    description: 'A full-stack web application for my hobby project. Built with Next.js, TypeScript, Tailwind CSS, and Supabase, with a focus on real-time collaboration and user experience.',
    icon: IconBackend,
    color: '#EFE7FA',
    link: 'https://kecha.vercel.app/',
    disabled: false,
  },
  {
    title: 'Basic CRUD Fullstack App',
    description: 'A simple full-stack application built with ASP.NET and SQL Server, demonstrating basic CRUD operations and authentication.',
    icon: IconMobile,
    color: '#DFF4E7',
    link: 'https://learndeploy-azfwgzbngqebhwcr.southeastasia-01.azurewebsites.net',
    disabled: false,
  },
  {
    title: 'Soon',
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    icon: IconOpenSource,
    color: '#DFF4E7',
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
      </section>
    </main>
  </div>

  <!-- Floating Widgets -->
  <ChatContainer />
  <LatencyIndicator />
  <CloudflareEdgeStatus />
</template>

<style scoped>
.landing {
  padding: var(--space-2xl) 0;
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

.landing__nav {
  display: inline-flex;
  gap: var(--space-xs);
  padding: 5px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--radius-badge);
  box-shadow: var(--glass-shadow);
}

.nav-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: var(--radius-badge);
  border: none;
  background: transparent;
  font-family: 'Nunito', sans-serif;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-medium);
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-tab:hover {
  color: var(--text-dark);
  background: rgba(255, 255, 255, 0.5);
}

.nav-tab--active {
  background: var(--blue-main);
  color: var(--text-dark);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
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
