/** @type {import('tailwindcss').Config} */
// Конфигурация Tailwind: только токены из src/styles/tokens.css и OUTPUT/docs/design-notes.md.
// Свои цвета/шрифты не добавлять; тяжёлые UI-киты запрещены (AGENTS §1.3).
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          0: 'var(--bg-0)',
          1: 'var(--bg-1)',
          2: 'var(--bg-2)',
        },
        panel: {
          DEFAULT: 'var(--panel)',
          solid: 'var(--panel-solid)',
        },
        stroke: {
          DEFAULT: 'var(--stroke)',
          strong: 'var(--stroke-strong)',
        },
        cyan: 'var(--cyan)',
        violet: 'var(--violet)',
        magenta: 'var(--magenta)',
        lime: 'var(--lime)',
        amber: 'var(--amber)',
        rose: 'var(--rose)',
        text: {
          DEFAULT: 'var(--text)',
          dim: 'var(--text-dim)',
          mute: 'var(--text-mute)',
        },
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
      },
      fontFamily: {
        sans: ['var(--font)'],
        mono: ['var(--mono)'],
      },
      boxShadow: {
        'glow-cyan': 'var(--glow-cyan)',
        'glow-violet': 'var(--glow-violet)',
      },
    },
  },
  plugins: [],
};
