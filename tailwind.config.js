/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        animation: {
          'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        },
        boxShadow: {
          'orange-glow': '0 0 20px rgba(255, 138, 61, 0.4)',
        }
      },
    },
    plugins: [],
  }