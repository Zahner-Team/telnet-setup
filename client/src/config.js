// client/src/config.js
const isDev = process.env.NODE_ENV === 'development';

export const API_BASE_URL = isDev
  ? 'http://127.0.0.1:3002'
  : 'http://127.0.0.1:3002'; // Same as development since backend is within Electron
export const WS_URL = isDev
  ? 'ws://127.0.0.1:3002'
  : 'ws://127.0.0.1:3002';
