require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const meetingsRoutes = require('./routes/meetings');
const livekitRoutes = require('./routes/livekit');
const attendanceRoutes = require('./routes/attendance');
const webhookRoutes = require('./routes/webhook');
const { registerSocketHandlers } = require('./socket/handlers');

const app = express();
const httpServer = http.createServer(app);

// ─── CORS ──────────────────────────────────────────────────────────────────
// --- CORS ---
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://meet-x-two.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── Socket.io ─────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedPatterns = [
        /\.vercel\.app$/,
        /\.netlify\.app$/,
        /\.onrender\.com$/,
        /^http:\/\/localhost/,
      ];
      if (
        allowedOrigins.includes(origin) ||
        allowedPatterns.some(p => p.test(origin))
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ────────────────────────────────────────────────────────────────
// Note: /api/webhook uses its own express.raw() per-route for signature verification
app.use('/api/webhook', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/attendance', attendanceRoutes);

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Socket.io handlers ────────────────────────────────────────────────────
registerSocketHandlers(io);

// ─── Start server ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 MeetX server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
