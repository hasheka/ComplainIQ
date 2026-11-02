/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef3f9',
          100: '#d9e4f1',
          200: '#b3c9e3',
          300: '#86a7cf',
          400: '#5a84b8',
          500: '#3a6599',
          600: '#2b4f7d',
          700: '#1f3d63',
          800: '#152b48',
          900: '#0d1d33',
          950: '#081426',
        },
        teal: {
          50: '#effcfb',
          100: '#d2f7f4',
          200: '#a6eee9',
          300: '#6ddcd5',
          400: '#3cc2b9',
          500: '#1ea8a0',
          600: '#13877f',
          700: '#116d68',
          800: '#0f5653',
          900: '#0c4442',
          950: '#052a29',
        },
        sky: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(8, 20, 38, 0.04), 0 4px 16px rgba(8, 20, 38, 0.06)',
        raised: '0 8px 24px rgba(8, 20, 38, 0.12)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};
