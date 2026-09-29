/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effaf3",
          100: "#d9f2e2",
          200: "#b5e4c8",
          300: "#84cfa6",
          400: "#51b37f",
          500: "#2f9763",
          600: "#1f7a4f",
          700: "#1a6242",
          800: "#174e36",
          900: "#14412e",
          950: "#0a2419",
        },
        harvest: {
          50: "#fff8eb",
          100: "#feeac7",
          200: "#fdd38a",
          300: "#fbb64d",
          400: "#f99a24",
          500: "#f0780b",
          600: "#d45606",
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(28, 25, 23, 0.04), 0 1px 3px rgba(28, 25, 23, 0.06)",
        lift: "0 10px 30px -12px rgba(20, 65, 46, 0.25), 0 4px 10px -6px rgba(28, 25, 23, 0.1)",
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "ring-pulse": {
          "0%": { boxShadow: "0 0 0 0 rgba(47, 151, 99, 0.55)" },
          "70%": { boxShadow: "0 0 0 18px rgba(47, 151, 99, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(47, 151, 99, 0)" },
        },
        // Homepage motion
        rise: {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        blob: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(40px, -30px) scale(1.1)" },
          "66%": { transform: "translate(-30px, 20px) scale(0.95)" },
        },
        "leaf-fall": {
          "0%": { transform: "translate3d(0, -10vh, 0) rotate(0deg)", opacity: "0" },
          "10%": { opacity: "0.7" },
          "90%": { opacity: "0.5" },
          "100%": { transform: "translate3d(60px, 110vh, 0) rotate(300deg)", opacity: "0" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "typing-dot": {
          "0%, 80%, 100%": { opacity: "0.3", transform: "translateY(0)" },
          "40%": { opacity: "1", transform: "translateY(-3px)" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "draw-line": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        "ken-burns": {
          from: { transform: "scale(1.02) translate(0, 0)" },
          to: { transform: "scale(1.14) translate(-2%, -1%)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.25s ease-out both",
        "ring-pulse": "ring-pulse 1.6s ease-out infinite",
        rise: "rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pop-in": "pop-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        float: "float 5s ease-in-out infinite",
        "float-slow": "float 7s ease-in-out infinite",
        blob: "blob 18s ease-in-out infinite",
        "leaf-fall": "leaf-fall linear infinite",
        marquee: "marquee 45s linear infinite",
        "typing-dot": "typing-dot 1.2s ease-in-out infinite",
        "gradient-x": "gradient-x 6s ease infinite",
        "draw-line": "draw-line 1.2s cubic-bezier(0.22, 1, 0.36, 1) both",
        "ken-burns": "ken-burns 24s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
};
