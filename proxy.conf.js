// Dev proxy for the Angular dev server. The backend URL is configurable so the
// same setup can target a local instance on another port (e.g. a feature build):
//   BACKEND_URL=http://localhost:8081 bun run start
const target = process.env.BACKEND_URL || 'http://localhost:8080';
const wsTarget = target.replace(/^http/, 'ws');

module.exports = {
  '/api': {
    target,
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
  },
  '/ws': {
    target: wsTarget,
    secure: false,
    ws: true,
    changeOrigin: true,
    logLevel: 'debug',
  },
};
