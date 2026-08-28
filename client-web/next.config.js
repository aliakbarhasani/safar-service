/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

module.exports = withPWA({
  reactStrictMode: true,
  // Provide a minimal turbopack config to avoid Turbopack/webpack conflict,
  // and pin the workspace root to this front-end so Next builds don't try to
  // resolve the monorepo root (multiple package-lock.json files coexist).
  turbopack: {
    root: __dirname,
  },
});
