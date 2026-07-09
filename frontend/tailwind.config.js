/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'rgb(8 8 16)', // Deep dark purple-navy background
        card: 'rgb(14 15 30)', // Dark card background
        border: 'rgba(255, 255, 255, 0.08)',
        muted: 'rgb(100 116 139)',
        primary: {
          DEFAULT: '#7c3aed', // TradeZella Purple/Violet
          dark: '#5b21b6', // Darker Purple
        },
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
    },
  },
  plugins: [],
}
