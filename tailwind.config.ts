import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-outfit)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: []
};

export default config;

