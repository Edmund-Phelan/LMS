import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/LMS/', // GitHub Pages repo path; change if a custom domain is set
  plugins: [react(), tailwindcss()],
})
