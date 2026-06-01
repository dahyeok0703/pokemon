import { defineConfig } from "vite";

// 루트의 data/ JSON을 '/data/...' 로 import 한다(Vite 루트 = repo 루트).
export default defineConfig({
  server: { fs: { allow: [".."] } },
  build: { chunkSizeWarningLimit: 8000 },
});
