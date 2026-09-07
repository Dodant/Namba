import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* The back office is a second document, not a route in the wiki's bundle. Two
   reasons, and the first is the one that matters: index.css is roughly 1,600 lines of
   global rules in which every control is a 999px capsule, and none of that
   belongs on a dense table. A separate document cannot inherit it. The second
   is that the reading pages should not carry a table UI nobody but an operator
   ever opens.

   In production the API serves dist/admin.html for /admin*; in development
   Vite has to be told, because /admin is a router path and admin.html is the
   file. Rewriting here rather than asking the router to live at /admin.html:
   the basename has to be the same in both, or every link in the panel is wrong
   in one of them. */
const adminRoute = {
  name: 'namba-admin-route',
  configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
    server.middlewares.use((req: { url?: string }, _res: unknown, next: () => void) => {
      const path = (req.url ?? '').split('?')[0]
      if (path === '/admin' || path.startsWith('/admin/')) req.url = '/admin.html'
      next()
    })
  },
}

export default defineConfig({
  plugins: [react(), adminRoute],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/uploads': 'http://127.0.0.1:8000',
      // the footer's API link. FastAPI's own two paths -- /docs fetches the
      // other one, so proxying one without the other is a blank page.
      '/docs': 'http://127.0.0.1:8000',
      '/openapi.json': 'http://127.0.0.1:8000',
    },
  },
})
