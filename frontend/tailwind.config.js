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
      },
      animation: {
        "fade-in-up": "fade-in-up 0.25s ease-out both",
        "ring-pulse": "ring-pulse 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};
