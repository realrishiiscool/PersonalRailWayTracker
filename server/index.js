import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const app = express();
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4000);
if (process.env.RENDER) app.set('trust proxy', 1);
const allowedOrigins = new Set((process.env.APP_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(origin => origin.trim()).filter(Boolean));
app.use(cors({ origin(origin, callback) { callback(null, !origin || allowedOrigins.has(origin)); }, methods: ['GET'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
const requestWindows = new Map();
app.use('/api', (req, res, next) => {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  let window = requestWindows.get(ip);
  if (!window || window.expiresAt <= now) {
    window = { count: 0, expiresAt: now + 60_000 };
    requestWindows.set(ip, window);
  }
  window.count += 1;
  if (window.count > 60) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((window.expiresAt - now) / 1000))));
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.', code: 'RATE_LIMITED' });
  }
  if (requestWindows.size > 1000) {
    for (const [key, value] of requestWindows) if (value.expiresAt <= now) requestWindows.delete(key);
  }
  next();
});
const providerBase = (process.env.RAILRADAR_API_BASE_URL || process.env.RAILWAY_API_BASE_URL || 'https://api.railradar.in').replace(/\/$/, '');
const providerKey = process.env.RAILRADAR_API_KEY || process.env.RAILWAY_API_KEY || '';
const cache = new Map();
async function providerGet(path, ttlMs = 30000) {
  if (!providerKey) { const error = new Error('Add a free RailRadar API key to .env to enable live railway data.'); error.status = 503; error.code = 'API_KEY_REQUIRED'; throw error; }
  const key = path;
  const prior = cache.get(key);
  if (prior && prior.expires > Date.now()) return { ...prior.value, cached: true };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.RAILWAY_API_TIMEOUT_MS || 7000));
  try {
    const upstream = await fetch(`${providerBase}${path}`, { headers: { authorization: `Bearer ${providerKey}`, accept: 'application/json' }, signal: controller.signal });
    const payload = await upstream.json();
    if (!upstream.ok || payload.success !== true) {
      const error = new Error(payload.error?.message || payload.message || `RailRadar returned HTTP ${upstream.status}`);
      error.status = upstream.status || 502;
      error.code = payload.error?.code || 'PROVIDER_ERROR';
      throw error;
    }
    let data = payload.data;
    if (/\/live(?:\?|$)/.test(path) && data?.currentLocation) {
      const current = data.currentLocation;
      const next = data.nextHalt || {};
      const currentStop = (data.route || []).find(stop => stop.stationCode === current.stationCode);
      const lat = currentStop?.latitude ?? currentStop?.lat ?? currentStop?.station?.lat;
      const lng = currentStop?.longitude ?? currentStop?.lng ?? currentStop?.station?.lng;
      data = { ...data, currentStation: current.stationName, nextStation: next.stationName, nextStopSequence: next.sequence, distanceToNextKm: next.distanceToNextKm, eta: next.expectedArrivalTime, speedKmh: current.speedKmh, updatedAt: data.lastUpdatedAt, freshness: { state: data.isLive ? 'LIVE' : 'STALE' }, position: Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null };
    } else if (/\/v1\/trains\/[^/]+(?:\?|$)/.test(path) && data?.train && Array.isArray(data.route)) {
      data = { ...data, ...data.train, stops: data.route.map(stop => ({ ...stop, station: stop.station || { code: stop.stationCode, name: stop.stationName, lat: stop.lat, lng: stop.lng }, scheduledArrival: stop.arrival || stop.scheduledArrival, scheduledDeparture: stop.departure || stop.scheduledDeparture, distanceKm: stop.distance })) };
    }
    const value = { data, status: 'SUCCESS', meta: payload.meta || null, cached: false };
    cache.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  } catch (error) {
    if (error.name === 'AbortError') { error.status = 504; error.code = 'PROVIDER_TIMEOUT'; error.message = 'Railway data provider timed out'; }
    throw error;
  } finally { clearTimeout(timeout); }
}
function sendProviderError(res, error) {
  const status = Number(error.status) || 502;
  res.status(status).json({ error: error.message || 'Railway data provider unavailable', code: error.code || 'PROVIDER_ERROR', mode: 'error' });
}
let pool;
if (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE) {
  pool = mysql.createPool({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, waitForConnections: true, connectionLimit: 10, enableKeepAlive: true });
}

app.get('/api/health', async (_req, res) => {
  let database = 'not_configured';
  if (pool) { try { await pool.query('SELECT 1'); database = 'connected'; } catch { database = 'unavailable'; } }
  res.json({ status: 'ok', database, liveProvider: providerKey ? 'configured' : 'key_required', timestamp: new Date().toISOString() });
});
app.get('/api/trains', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ data: [], mode: providerKey ? 'live' : 'unavailable' });
  try {
    const result = await providerGet(`/v1/lookup/search/trains?q=${encodeURIComponent(q)}&limit=8`, 10 * 60 * 1000);
    return res.json({ ...result, mode: 'live' });
  } catch (error) { return sendProviderError(res, error); }
});
app.get('/api/trains/:number/live', async (req, res) => {
  try { return res.json({ ...(await providerGet(`/v1/trains/${encodeURIComponent(req.params.number)}/live?includeCoordinates=true`, 45 * 1000)), mode: 'live' }); }
  catch (error) { return sendProviderError(res, error); }
});
app.get('/api/trains/:number/route', async (req, res) => {
  try { return res.json({ ...(await providerGet(`/v1/trains/${encodeURIComponent(req.params.number)}?haltsOnly=true`, 60 * 60 * 1000)), mode: 'live' }); }
  catch (error) { return sendProviderError(res, error); }
});
app.get('/api/stations/:code/board', async (req, res) => {
  try { return res.json({ ...(await providerGet(`/v1/stations/${encodeURIComponent(req.params.code)}/live?hours=4`, 60 * 1000)), mode: 'live' }); }
  catch (error) { return sendProviderError(res, error); }
});
app.get('/api/pnr/:pnr', async (req, res) => {
  if (!/^\d{10}$/.test(req.params.pnr)) return res.status(400).json({ error: 'PNR must contain 10 digits', code: 'INVALID_PNR' });
  try { return res.json({ ...(await providerGet(`/v1/pnr/${req.params.pnr}`, 60 * 1000)), mode: 'live' }); }
  catch (error) { return sendProviderError(res, error); }
});
app.use((err, _req, res, _next) => { console.error(err.message); res.status(500).json({ error: 'Unexpected server error' }); });
app.listen(port, host, () => console.log(`Railway tracker API listening on http://${host}:${port}`));
