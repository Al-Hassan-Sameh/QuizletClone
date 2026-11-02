import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig(({ mode }) => {
  const base = mode === "pages" ? "/QuizletClone/" : "/";
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        scope: base,
        registerType: "prompt",
        includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
        manifest: {
          name: "Recall — Your study space",
          short_name: "Recall",
          description: "Private, offline flashcards and study tools",
          theme_color: "#6558dd",
          background_color: "#f7f8fc",
          display: "standalone",
          id: base,
          start_url: base,
          scope: base,
          icons: [
            {
              src: "icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
          ],
        },
        workbox: {
          clientsClaim: true,
          navigateFallback: `${base}index.html`,
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        },
      }),
    ],
  };
});
