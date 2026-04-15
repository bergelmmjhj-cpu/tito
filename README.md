# Time In / Time Out (v1)

Simple "Time In / Time Out" starter app.

- Frontend: plain HTML/CSS/JS (`client/`)
- Backend: Node.js + Express (`server/`)
- Storage: in-memory (resets when server restarts)

## Run locally

### 1) Start backend
```bash
cd server
npm install
cp .env.example .env
npm start
```

Server should be running at `http://localhost:3000`.

Test quickly:
```bash
curl http://localhost:3000/
```

### 2) Open frontend
Open `client/index.html` in your browser.

> Note: If your browser blocks requests due to CORS or file restrictions, serve the `client/` folder with a tiny static server (optional). For example:
```bash
npx serve client
```

## API

- `GET /` → `TimeClock API running`
- `POST /clock-in` body: `{ "workerId": "string", "hotelName": "string" }`
  - Creates a new open shift
  - Prevents double clock-in if an open shift exists
- `POST /clock-out` body: `{ "workerId": "string" }`
  - Closes the open shift for that worker
- `GET /logs/:workerId`
  - Returns that worker's logs
