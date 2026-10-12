import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        paper: "#f3efe4",
        ink: "#1c221e",
        moss: "#1f6f5b",
        amber: "#e0b84a",
        coral: "#c4493a",
      },
      fontFamily: {
        display: ["var(--font-display)", "Bricolage Grotesque", "sans-serif"],
        sans: ["var(--font-body)", "IBM Plex Sans", "sans-serif"],
      },
      boxShadow: {
        soft: "0 18px 50px rgba(28, 34, 30, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
