import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg))",
        panel: "rgb(var(--panel))",
        text: "rgb(var(--text))",
        muted: "rgb(var(--muted))",
        gold: "rgb(var(--gold))",
        ember: "rgb(var(--ember))",
        ice: "rgb(var(--ice))",
        stroke: "rgb(var(--stroke))",
      },
      borderRadius: {
        xl: "var(--radius)",
      },
      boxShadow: {
        glowEmber: "0 0 24px rgba(255, 122, 46, 0.25)",
        glowIce: "0 0 24px rgba(73, 195, 255, 0.20)",
        glowGold: "0 0 24px rgba(214, 176, 112, 0.18)",
      },
    },
  },
  plugins: [],
}

export default config
