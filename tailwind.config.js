/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      keyframes: {
        'slide-right': {
          '0%': { transform: 'translateX(-100%)' },
          '50%, 100%': { transform: 'translateX(0)' }
        },
        'slide-left': {
          '0%': { transform: 'translateX(100%)' },
          '50%, 100%': { transform: 'translateX(0)' }
        }
      },
      animation: {
        'slide-right': 'slide-right 3s ease-in-out infinite',
        'slide-left': 'slide-left 3s ease-in-out infinite'
      }
    },
  },
  plugins: [],
} 