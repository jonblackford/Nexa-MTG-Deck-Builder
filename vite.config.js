import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Nexa-MTG-Deck-Builder/',   // <-- EXACT repo name, with slashes
})
