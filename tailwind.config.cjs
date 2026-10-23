/** JTE live site — prebuilt Tailwind (replaces the runtime CDN).
 *  Scans all HTML plus scripts/build-blog.mjs (so blog card/related-card
 *  class variants that only render once >1 post is live are still included).
 *  Rebuild after adding new classes:  npm run css  (see package.json)  */
module.exports = {
  content: ['./**/*.html', './scripts/**/*.mjs'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Playfair Display', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        luxury: {
          black: '#0a0a0a',
          charcoal: '#141414',
          gold: '#C6A87C',
          goldLight: '#E5D4B3',
          goldDark: '#8C7350',
          cream: '#F5F1E8',
          warmGray: '#8A8A8A',
        },
      },
    },
  },
};
