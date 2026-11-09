import { defineConfig } from 'vite'
export default defineConfig({
  ssr: { noExternal: true },
  build: { ssr: true, outDir: 'dist-runtime', target: 'node22', minify: false, rolldownOptions: { input: {cli:'runtime/cli.ts',mcp:'runtime/mcp-main.ts'},output: { entryFileNames: '[name].mjs' } } }
})
