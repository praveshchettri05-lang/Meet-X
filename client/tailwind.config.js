/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'meet-blue': '#1a73e8',
        'meet-dark': '#202124',
        'meet-gray': '#3c4043',
        'meet-light': '#f1f3f4',
        'meet-green': '#34a853',
        'meet-red': '#ea4335',
        'meet-yellow': '#fbbc04',
      },
      fontFamily: {
        google: ['Google Sans', 'Roboto', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
