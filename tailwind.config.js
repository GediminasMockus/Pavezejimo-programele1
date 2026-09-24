/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
      "primary": {
            "50": "rgb(var(--primary-50) / <alpha-value>)",
            "100": "rgb(var(--primary-100) / <alpha-value>)",
            "200": "rgb(var(--primary-200) / <alpha-value>)",
            "300": "rgb(var(--primary-300) / <alpha-value>)",
            "400": "rgb(var(--primary-400) / <alpha-value>)",
            "500": "rgb(var(--primary-500) / <alpha-value>)",
            "600": "rgb(var(--primary-600) / <alpha-value>)",
            "700": "rgb(var(--primary-700) / <alpha-value>)",
            "800": "rgb(var(--primary-800) / <alpha-value>)",
            "900": "rgb(var(--primary-900) / <alpha-value>)",
            "950": "rgb(var(--primary-950) / <alpha-value>)"
      },
      "neutral": {
            "50": "rgb(var(--neutral-50) / <alpha-value>)",
            "100": "rgb(var(--neutral-100) / <alpha-value>)",
            "200": "rgb(var(--neutral-200) / <alpha-value>)",
            "300": "rgb(var(--neutral-300) / <alpha-value>)",
            "400": "rgb(var(--neutral-400) / <alpha-value>)",
            "500": "rgb(var(--neutral-500) / <alpha-value>)",
            "600": "rgb(var(--neutral-600) / <alpha-value>)",
            "700": "rgb(var(--neutral-700) / <alpha-value>)",
            "800": "rgb(var(--neutral-800) / <alpha-value>)",
            "900": "rgb(var(--neutral-900) / <alpha-value>)",
            "950": "rgb(var(--neutral-950) / <alpha-value>)"
      },
      "success": {
            "50": "rgb(var(--success-50) / <alpha-value>)",
            "100": "rgb(var(--success-100) / <alpha-value>)",
            "200": "rgb(var(--success-200) / <alpha-value>)",
            "300": "rgb(var(--success-300) / <alpha-value>)",
            "400": "rgb(var(--success-400) / <alpha-value>)",
            "500": "rgb(var(--success-500) / <alpha-value>)",
            "600": "rgb(var(--success-600) / <alpha-value>)",
            "700": "rgb(var(--success-700) / <alpha-value>)",
            "800": "rgb(var(--success-800) / <alpha-value>)",
            "900": "rgb(var(--success-900) / <alpha-value>)",
            "950": "rgb(var(--success-950) / <alpha-value>)"
      },
      "danger": {
            "50": "rgb(var(--danger-50) / <alpha-value>)",
            "100": "rgb(var(--danger-100) / <alpha-value>)",
            "200": "rgb(var(--danger-200) / <alpha-value>)",
            "300": "rgb(var(--danger-300) / <alpha-value>)",
            "400": "rgb(var(--danger-400) / <alpha-value>)",
            "500": "rgb(var(--danger-500) / <alpha-value>)",
            "600": "rgb(var(--danger-600) / <alpha-value>)",
            "700": "rgb(var(--danger-700) / <alpha-value>)",
            "800": "rgb(var(--danger-800) / <alpha-value>)",
            "900": "rgb(var(--danger-900) / <alpha-value>)",
            "950": "rgb(var(--danger-950) / <alpha-value>)"
      },
      "warning": {
            "50": "rgb(var(--warning-50) / <alpha-value>)",
            "100": "rgb(var(--warning-100) / <alpha-value>)",
            "200": "rgb(var(--warning-200) / <alpha-value>)",
            "300": "rgb(var(--warning-300) / <alpha-value>)",
            "400": "rgb(var(--warning-400) / <alpha-value>)",
            "500": "rgb(var(--warning-500) / <alpha-value>)",
            "600": "rgb(var(--warning-600) / <alpha-value>)",
            "700": "rgb(var(--warning-700) / <alpha-value>)",
            "800": "rgb(var(--warning-800) / <alpha-value>)",
            "900": "rgb(var(--warning-900) / <alpha-value>)",
            "950": "rgb(var(--warning-950) / <alpha-value>)"
      },
      "canvas": "rgb(var(--canvas) / <alpha-value>)",
      "surface": "rgb(var(--surface) / <alpha-value>)",
      "on-primary": "rgb(var(--on-primary) / <alpha-value>)",
      "overlay": "rgb(var(--overlay) / <alpha-value>)"
},
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-card)',
        card: 'var(--shadow-card)',
        overlay: 'var(--shadow-overlay)',
      },
    },
  },
  plugins: [],
};
