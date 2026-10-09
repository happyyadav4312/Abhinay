import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import { localMediaStorage, MEDIA_CATEGORIES, MEDIA_ROUTE_PREFIX } from './config/storage';
import routes from './routes';
import { CLIENT_HEADER, isTrustedOrigin } from './middleware/origin.middleware';
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/notFound.middleware';
import { LIMITS } from './validators/common';

/**
 * The Express application, importable without side effects.
 * `server.ts` owns binding, startup logging and shutdown.
 */
const app = express();

// Behind a single local reverse proxy at most; needed for correct client IPs in
// the rate limiter without trusting arbitrary X-Forwarded-For chains.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ── Security ────────────────────────────────────────────
app.use(
  helmet({
    // Profile images are served to a different origin (the Next.js app).
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

/**
 * Credentialed CORS for exactly one origin — never `*`, which the browser would
 * reject alongside `credentials: true` anyway. Requests with no Origin (curl,
 * Postman, server-to-server) are allowed through; they carry no ambient cookies.
 */
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isTrustedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    // PATCH is used by casting status changes; without it the browser's
    // preflight fails before the request is ever sent.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', CLIENT_HEADER],
    maxAge: 600,
  })
);

// ── Parsing ─────────────────────────────────────────────
// Bounded: a large body is rejected with 413 rather than buffered.
app.use(express.json({ limit: LIMITS.JSON_BODY_BYTES }));
app.use(express.urlencoded({ extended: false, limit: LIMITS.JSON_BODY_BYTES }));
app.use(cookieParser());

// ── Logging ─────────────────────────────────────────────
// `dev` format logs method, path, status and time only — no headers, cookies or bodies.
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── Static media (LOCAL driver only) ────────────────────
// Files kept by the LOCAL media driver — the test suites, and profile photos
// uploaded before Cloudinary — are served from one directory per category.
// Cloudinary files are delivered by Cloudinary and never pass through here.
// The temporary upload directory is deliberately NOT exposed.
for (const category of MEDIA_CATEGORIES) {
  app.use(
    `${MEDIA_ROUTE_PREFIX}/${category}`,
    express.static(localMediaStorage.directoryFor(category), {
      index: false,
      dotfiles: 'deny',
      fallthrough: true,
      maxAge: '1h',
    })
  );
}

// ── Routes ──────────────────────────────────────────────
app.use('/api/v1', routes);

// ── Error handling ──────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
