<script setup lang="ts">
withDefaults(
  defineProps<{
    avatarId?: string
    size?: number
  }>(),
  {
    avatarId: 'ironman',
    size: 32,
  }
)
</script>

<template>
  <div
    class="avenger-avatar"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <!-- 1. Iron Man -->
    <svg v-if="avatarId === 'ironman'" viewBox="0 0 16 16" :width="size" :height="size" class="pixel-art">
      <rect width="16" height="16" fill="#900C3F" rx="3" />
      <rect x="3" y="2" width="10" height="12" fill="#C0392B" />
      <rect x="4" y="3" width="8" height="10" fill="#F1C40F" />
      <rect x="3" y="3" width="1" height="4" fill="#900C3F" />
      <rect x="12" y="3" width="1" height="4" fill="#900C3F" />
      <rect x="4" y="6" width="3" height="2" fill="#EBF5FB" />
      <rect x="9" y="6" width="3" height="2" fill="#EBF5FB" />
      <rect x="5" y="6" width="2" height="1" fill="#00FFFF" />
      <rect x="9" y="6" width="2" height="1" fill="#00FFFF" />
      <rect x="6" y="10" width="4" height="1" fill="#7B241C" />
      <rect x="5" y="11" width="6" height="2" fill="#C0392B" />
      <rect x="7" y="13" width="2" height="2" fill="#F1C40F" />
    </svg>

    <!-- 2. Captain America -->
    <svg v-else-if="avatarId === 'cap'" viewBox="0 0 16 16" :width="size" :height="size" class="pixel-art">
      <rect width="16" height="16" fill="#1B4F72" rx="3" />
      <rect x="3" y="1" width="10" height="6" fill="#2980B9" />
      <rect x="7" y="2" width="2" height="3" fill="#FFFFFF" />
      <rect x="6" y="3" width="4" height="1" fill="#FFFFFF" />
      <rect x="3" y="6" width="10" height="5" fill="#FFE0BD" />
      <rect x="4" y="7" width="2" height="2" fill="#1B4F72" />
      <rect x="10" y="7" width="2" height="2" fill="#1B4F72" />
      <rect x="3" y="6" width="1" height="4" fill="#2980B9" />
      <rect x="12" y="6" width="1" height="4" fill="#2980B9" />
      <rect x="6" y="9" width="4" height="1" fill="#C0392B" />
      <rect x="3" y="11" width="10" height="4" fill="#2980B9" />
      <rect x="5" y="12" width="6" height="3" fill="#FFFFFF" />
      <rect x="6" y="12" width="1" height="3" fill="#C0392B" />
      <rect x="9" y="12" width="1" height="3" fill="#C0392B" />
    </svg>

    <!-- 3. Thor -->
    <svg v-else-if="avatarId === 'thor'" viewBox="0 0 16 16" :width="size" :height="size" class="pixel-art">
      <rect width="16" height="16" fill="#5D6D7E" rx="3" />
      <!-- Silver Winged Helmet -->
      <rect x="4" y="1" width="8" height="5" fill="#BDC3C7" />
      <rect x="1" y="2" width="2" height="4" fill="#ECF0F1" />
      <rect x="13" y="2" width="2" height="4" fill="#ECF0F1" />
      <!-- Golden Blonde Hair -->
      <rect x="2" y="5" width="2" height="8" fill="#F39C12" />
      <rect x="12" y="5" width="2" height="8" fill="#F39C12" />
      <!-- Face -->
      <rect x="4" y="5" width="8" height="6" fill="#FFE0BD" />
      <rect x="5" y="7" width="2" height="2" fill="#2980B9" />
      <rect x="9" y="7" width="2" height="2" fill="#2980B9" />
      <rect x="6" y="10" width="4" height="1" fill="#D27D7D" />
      <!-- Suit & Red Cape Collar -->
      <rect x="3" y="11" width="10" height="4" fill="#34495E" />
      <rect x="2" y="11" width="2" height="4" fill="#C0392B" />
      <rect x="12" y="11" width="2" height="4" fill="#C0392B" />
      <rect x="6" y="12" width="1" height="2" fill="#BDC3C7" />
      <rect x="9" y="12" width="1" height="2" fill="#BDC3C7" />
    </svg>

    <!-- 4. Hulk -->
    <svg v-else-if="avatarId === 'hulk'" viewBox="0 0 16 16" :width="size" :height="size" class="pixel-art">
      <rect width="16" height="16" fill="#1E4620" rx="3" />
      <!-- Dark Green Hair -->
      <rect x="3" y="1" width="10" height="4" fill="#0E280F" />
      <rect x="2" y="3" width="2" height="2" fill="#0E280F" />
      <rect x="12" y="3" width="2" height="2" fill="#0E280F" />
      <!-- Gamma Green Face -->
      <rect x="3" y="4" width="10" height="8" fill="#27AE60" />
      <rect x="4" y="6" width="3" height="1" fill="#0E280F" />
      <rect x="9" y="6" width="3" height="1" fill="#0E280F" />
      <rect x="4" y="7" width="2" height="2" fill="#145A32" />
      <rect x="10" y="7" width="2" height="2" fill="#145A32" />
      <rect x="5" y="10" width="6" height="1" fill="#0E280F" />
      <!-- Purple Pants/Shirt -->
      <rect x="2" y="12" width="12" height="3" fill="#8E44AD" />
    </svg>

    <!-- 5. Spider-Man -->
    <svg v-else-if="avatarId === 'spiderman'" viewBox="0 0 16 16" :width="size" :height="size" class="pixel-art">
      <rect width="16" height="16" fill="#C0392B" rx="3" />
      <!-- Webbing patterns -->
      <rect x="7" y="1" width="2" height="13" fill="#900C3F" />
      <rect x="2" y="6" width="12" height="2" fill="#900C3F" />
      <!-- White Lenses with Black border -->
      <rect x="2" y="5" width="5" height="5" fill="#2F2F2F" />
      <rect x="9" y="5" width="5" height="5" fill="#2F2F2F" />
      <rect x="3" y="6" width="3" height="3" fill="#FFFFFF" />
      <rect x="10" y="6" width="3" height="3" fill="#FFFFFF" />
      <!-- Blue Suit shoulders -->
      <rect x="1" y="12" width="3" height="4" fill="#2980B9" />
      <rect x="12" y="12" width="3" height="4" fill="#2980B9" />
    </svg>

    <!-- 6. Black Widow -->
    <svg v-else-if="avatarId === 'blackwidow'" viewBox="0 0 16 16" :width="size" :height="size" class="pixel-art">
      <rect width="16" height="16" fill="#D35400" rx="3" />
      <!-- Auburn Red Hair -->
      <rect x="2" y="1" width="12" height="6" fill="#E67E22" />
      <rect x="1" y="4" width="3" height="8" fill="#E67E22" />
      <rect x="12" y="4" width="3" height="8" fill="#E67E22" />
      <!-- Face -->
      <rect x="4" y="5" width="8" height="6" fill="#FFE0BD" />
      <rect x="5" y="7" width="2" height="2" fill="#27AE60" />
      <rect x="9" y="7" width="2" height="2" fill="#27AE60" />
      <rect x="6" y="10" width="4" height="1" fill="#C0392B" />
      <!-- Tactical Black Suit & Gold Hourglass -->
      <rect x="3" y="11" width="10" height="4" fill="#1C2833" />
      <rect x="7" y="12" width="2" height="2" fill="#F1C40F" />
    </svg>

    <!-- 7. Black Panther -->
    <svg v-else-if="avatarId === 'blackpanther'" viewBox="0 0 16 16" :width="size" :height="size" class="pixel-art">
      <rect width="16" height="16" fill="#1B2631" rx="3" />
      <!-- Panther Ears -->
      <rect x="2" y="1" width="2" height="3" fill="#2C3E50" />
      <rect x="12" y="1" width="2" height="3" fill="#2C3E50" />
      <!-- Mask -->
      <rect x="3" y="3" width="10" height="9" fill="#2C3E50" />
      <!-- Narrow Silver Lenses -->
      <rect x="4" y="6" width="3" height="2" fill="#EAECEE" />
      <rect x="9" y="6" width="3" height="2" fill="#EAECEE" />
      <rect x="5" y="6" width="1" height="1" fill="#1B2631" />
      <rect x="10" y="6" width="1" height="1" fill="#1B2631" />
      <!-- Vibranium Silver/Purple Claw Necklace -->
      <rect x="3" y="12" width="10" height="3" fill="#1B2631" />
      <rect x="4" y="12" width="1" height="2" fill="#D9C8F1" />
      <rect x="6" y="13" width="1" height="2" fill="#D9C8F1" />
      <rect x="9" y="13" width="1" height="2" fill="#D9C8F1" />
      <rect x="11" y="12" width="1" height="2" fill="#D9C8F1" />
    </svg>

    <!-- 8. Doctor Strange -->
    <svg v-else-if="avatarId === 'drstrange'" viewBox="0 0 16 16" :width="size" :height="size" class="pixel-art">
      <rect width="16" height="16" fill="#1B4F72" rx="3" />
      <!-- Black Hair with Grey Temples -->
      <rect x="4" y="1" width="8" height="4" fill="#2F2F2F" />
      <rect x="3" y="3" width="1" height="3" fill="#EAECEE" />
      <rect x="12" y="3" width="1" height="3" fill="#EAECEE" />
      <!-- Face & Goatee -->
      <rect x="4" y="4" width="8" height="7" fill="#FFE0BD" />
      <rect x="5" y="6" width="2" height="2" fill="#2F2F2F" />
      <rect x="9" y="6" width="2" height="2" fill="#2F2F2F" />
      <rect x="7" y="9" width="2" height="2" fill="#2F2F2F" />
      <!-- Flared Red Cloak Collar -->
      <rect x="1" y="6" width="3" height="8" fill="#C0392B" />
      <rect x="12" y="6" width="3" height="8" fill="#C0392B" />
      <!-- Blue Tunic & Eye of Agamotto Gold Pendant -->
      <rect x="4" y="11" width="8" height="4" fill="#2980B9" />
      <rect x="7" y="11" width="2" height="2" fill="#F1C40F" />
    </svg>

    <!-- 9. Groot -->
    <svg v-else-if="avatarId === 'groot'" viewBox="0 0 16 16" :width="size" :height="size" class="pixel-art">
      <rect width="16" height="16" fill="#6E2C00" rx="3" />
      <!-- Green Sprout Leaf -->
      <rect x="8" y="1" width="3" height="2" fill="#27AE60" />
      <rect x="9" y="0" width="1" height="1" fill="#27AE60" />
      <!-- Wooden Bark Head -->
      <rect x="3" y="3" width="10" height="9" fill="#A0522D" />
      <rect x="4" y="2" width="8" height="1" fill="#8B5A2B" />
      <!-- Wood Grain Texture Lines -->
      <rect x="4" y="4" width="1" height="3" fill="#5C2C16" />
      <rect x="11" y="5" width="1" height="4" fill="#5C2C16" />
      <!-- Big Cute Eyes -->
      <rect x="4" y="6" width="3" height="3" fill="#1C2833" />
      <rect x="9" y="6" width="3" height="3" fill="#1C2833" />
      <rect x="4" y="6" width="1" height="1" fill="#FFFFFF" />
      <rect x="9" y="6" width="1" height="1" fill="#FFFFFF" />
      <!-- Friendly Smile -->
      <rect x="6" y="10" width="4" height="1" fill="#5C2C16" />
      <!-- Bark Body -->
      <rect x="3" y="12" width="10" height="3" fill="#8B5A2B" />
    </svg>

    <!-- Fallback Default User Avatar -->
    <svg v-else viewBox="0 0 16 16" :width="size" :height="size" class="pixel-art">
      <rect width="16" height="16" fill="#A9D6E5" rx="3" />
      <rect x="4" y="2" width="8" height="3" fill="#4B6B94" />
      <rect x="4" y="5" width="8" height="6" fill="#FFE0BD" />
      <rect x="5" y="7" width="2" height="2" fill="#2F2F2F" />
      <rect x="9" y="7" width="2" height="2" fill="#2F2F2F" />
      <rect x="7" y="10" width="2" height="1" fill="#4B6B94" />
      <rect x="3" y="12" width="10" height="4" fill="#F7E4A8" />
    </svg>
  </div>
</template>

<style scoped>
.avenger-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
</style>
