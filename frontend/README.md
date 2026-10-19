# IdoRacing Analytics frontend

React 19 + TypeScript + Vite single-page app for IdoRacing Analytics. It talks to the FastAPI backend under `/api`.

```bash
npm ci
npm run dev     # http://localhost:5173, proxies /api to http://localhost:8501
npm run build   # type-checks and writes dist/, which the backend serves in production
npm run lint
```

See the [project README](../README.md) for running the backend.
