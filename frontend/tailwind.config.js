/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#050911",
        base: "#080E1A",
        surface: "#0C1522",
        panel: "#101A28",
        rim: "#182233",
        gold: {
          DEFAULT: "#C4993B",
          bright: "#DDB84A",
          dim: "#7A5F22",
          faint: "#C4993B15",
          border: "#C4993B40",
        },
        teal: {
          DEFAULT: "#2EC4B6",
          dim: "#1A7A70",
          faint: "#2EC4B615",
        },
        crimson: "#C44040",
        wire: "#1A2535",
        ink: {
          primary: "#DDD5C4",
          secondary: "#8A9BB0",
          dim: "#4A5568",
        },
      },
      fontFamily: {
        display: ["'Bebas Neue'", "sans-serif"],
        body: ["'Outfit'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      letterSpacing: {
        widest2: "0.2em",
        widest3: "0.3em",
      },
      animation: {
        "pulse-gold": "pulse-gold 2s ease-in-out infinite",
        "reveal-bar": "reveal-bar 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "flicker": "flicker 0.15s ease-out",
      },
      keyframes: {
        "pulse-gold": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "reveal-bar": {
          "0%": { width: "0%", opacity: "0" },
          "100%": { opacity: "1" },
        },
        "flicker": {
          "0%": { opacity: "0.6" },
          "50%": { opacity: "1" },
          "100%": { opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
};
