# Time In / Time Out (v1)

Simple worker time-tracking starter app.

- **Frontend**: plain HTML / CSS / JS (`client/`)
- **Backend**: Node.js + Express (`server/`)
- **Storage**: in-memory (resets on server restart)

## Folder structure

```text
client/
  index.html
  app.js
  style.css

server/
  index.js
  package.json
  .env.example

README.md
```

## Run locally

### 1) Start the backend

```bash
cd server
npm install
cp .env.example .env   # optional – defaults to PORT=3000
npm start
```

The API will be available at `http://localhost:3000`.

Quick smoke-test:

```bash
curl http://localhost:3000/
# TimeClock API running
```

### 2) Open the frontend

Open `client/index.html` directly in your browser.

> If your browser blocks `fetch` requests due to the `file://` protocol, serve the
> `client/` folder with a tiny static server instead:
>
> ```bash
> npx serve client
> ```

## API endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/` | — | Health check – returns `TimeClock API running` |
| `POST` | `/clock-in` | `{ "workerId": "string", "hotelName": "string" }` | Creates a new open shift. Returns **409** if worker already has an open shift. |
| `POST` | `/clock-out` | `{ "workerId": "string" }` | Closes the open shift for the worker. Returns **404** if no open shift. |
| `GET` | `/logs/:workerId` | — | Returns the full shift history array for that worker. |

Missing / invalid fields return **400** with a descriptive `error` message.
