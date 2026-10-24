# Frontend

React 19, Vite 8, Tailwind CSS 4, and Socket.IO client for the Commonroom guest chat.

## Local development

Use Node.js 22 or 24. Start the backend with authenticated Redis as described in `../backend/README.md`, then run:

```powershell
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173` and proxies `/api` and `/socket.io` to `http://127.0.0.1:4000`. Set `VITE_BACKEND_PROXY` to change the proxy target. Set `VITE_SOCKET_URL` only when Socket.IO must use a different public origin; otherwise it uses the page origin. Keep these values public and never put backend secrets in Vite variables.

## Validation

```powershell
npm test
npm run build
```

The guest-session REST response's `token` is mapped to the `sessionToken` field used by Socket.IO auth. The signed session is stored only in the current browser tab's `sessionStorage`. Production hosting must reverse-proxy `/api` and `/socket.io` to the backend, as planned for the infrastructure phase.
