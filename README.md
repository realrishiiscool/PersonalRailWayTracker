# Trackline — Indian Railways tracker

A responsive React/Vite dashboard and Express API for Indian Railways information. The UI displays only live RailRadar search results and provider-backed status/route responses. It has no mock train records; without a valid API key, live search is unavailable.

## Run locally

1. Install Node.js 18+. MySQL is optional unless you want to use the included database schema.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add your free `RAILRADAR_API_KEY`.
4. Run `npm run dev` and open the Vite URL shown in the terminal. This starts the Express API and Vite together; the API binds to `127.0.0.1` by default and the Vite server proxies `/api` to port 4000.
5. To create the initial database, execute `db/schema.sql` in MySQL, then set the MySQL connection variables in `.env`.

## Publish on GitHub Pages

This repository includes a GitHub Actions workflow that builds and publishes the frontend from `main`. In the repository settings, enable **Pages → Build and deployment → GitHub Actions**. The site uses hash-based routes, so page refreshes and direct links work under the repository path.

GitHub Pages only hosts static files; it cannot run the Express API. To enable live data, deploy `server/` to a trusted Node.js host, configure `RAILRADAR_API_KEY` as a server-side secret, and set the GitHub repository variable `VITE_API_BASE_URL` to that API's HTTPS origin (for example, `https://api.example.com`). Configure the API's `APP_ORIGINS` to include `https://realrishiiscool.github.io`. Do not put provider keys in `VITE_*` variables: those are embedded in public browser code. If no API URL is configured, the hosted frontend reports that live data is unavailable instead of exposing a key or pretending the API runs on Pages.

The optional `.env` is excluded from Git. The project manifest is `package.json` (not `package.jison`).

## Data providers

The server integrates RailRadar (`https://api.railradar.in`) for train search, live status, schedules/routes, station boards and PNR. Get a key from [RailRadar developer signup](https://railradar.in/signup?redirect=/developers). Keep the key only in the backend `.env`; it is never placed in React code or sent to the browser. `.env*` files are ignored by Git except `.env.example`. The local API binds to loopback so other devices cannot call the key proxy by default. For a hosted deployment, set secrets in the host's environment-variable manager and add access controls/rate limits before exposing the API publicly. If a key is ever published or shared, rotate it with the provider. The integration adds request timeouts and in-memory caching. Check provider coverage and terms before relying on its data. No NTES/CRIS scraping is used.

## Current foundation

- Live train search, selected-train running status, and route schedule
- Leaflet/OpenStreetMap map when the provider returns usable coordinates
- Express endpoints for live search, status, route, station board, and PNR responses
- No hard-coded train records or demo fallback; missing provider data stays empty or shows an error
- Hash-based routes for live view, map, station board, route schedule and selected-train deep links
- Scrollable rail-style route progress and a remembered "I'm on this train" mode for the selected train
- MySQL schema for stations, trains, stops, running days, position history, locomotives and rake/coach composition

Train status refreshes when you select a result or press the refresh button. This avoids consuming the free API quota with background polling.
