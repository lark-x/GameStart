import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const v2ApiTarget = process.env.V2_API_PROXY_TARGET ?? "http://127.0.0.1:3003";

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: "living-network-vue-entry",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          // 默认保留不干扰 vite 的默认加载逻辑
          next();
        });
      },
    },
  ],
  root: ".",
  resolve: {
    alias: {
      "@": resolve(root, "src"),
      "@living-network/contracts/v2": resolve(root, "../../packages/contracts/src/v2/index.ts"),
      "@living-network/contracts": resolve(root, "../../packages/contracts/src/index.ts"),
    },
  },
  server: {
    port: 4173,
    proxy: {
      "/api/v2": v2ApiTarget,
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
      },
    },
    outDir: "dist",
  },
});
