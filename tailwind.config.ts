import type { Config } from "tailwindcss";

/**
 * HeirVault design tokens.
 *
 * Colours are expressed as CSS variables defined in `src/app/globals.css` so the
 * palette can be re-themed without touching component code.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--hv-canvas) / <alpha-value>)",
        surface: "rgb(var(--hv-surface) / <alpha-value>)",
        "surface-raised": "rgb(var(--hv-surface-raised) / <alpha-value>)",
        border: "rgb(var(--hv-border) / <alpha-value>)",
        muted: "rgb(var(--hv-muted) / <alpha-value>)",
        content: "rgb(var(--hv-content) / <alpha-value>)",
        "content-strong": "rgb(var(--hv-content-strong) / <alpha-value>)",
        brand: {
          50: "#eef4ff",
          100: "#dae6ff",
          200: "#bcd2ff",
          300: "#8eb4ff",
          400: "#598cff",
          500: "#3465f0",
          600: "#2347d1",
          700: "#1c39a8",
          800: "#1c3488",
          900: "#1c306e",
        },
        accent: {
          500: "#0ea5a4",
          600: "#0b8483",
        },
        success: {
          100: "#dcfce7",
          500: "#16a34a",
          700: "#15803d",
        },
        warning: {
          100: "#fef3c7",
          500: "#d97706",
          700: "#b45309",
        },
        danger: {
          100: "#fee2e2",
          500: "#dc2626",
          700: "#b91c1c",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.18)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
