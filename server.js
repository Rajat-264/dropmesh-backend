const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config(); // Load .env if available

const app = express();
const server = http.createServer(app);

// === Setup CORS ===
const allowedOrigins = [
  'http://localhost:5173',
  'https://your-frontend-domain.com', // ✅ Replace with your deployed frontend URL
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json());

// === In-memory Device Store ===
const devices = new Map();

// === Socket.IO Setup ===
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log('🟢 Socket connected:', socket.id);

  socket.on('register-device', ({ deviceId, username }) => {
    console.log(`📱 Registered: ${username} (${deviceId})`);
    devices.set(deviceId, { socketId: socket.id, username, deviceId });
    io.emit('active-devices', Array.from(devices.values()));
  });

  socket.on('get-devices', () => {
    socket.emit('active-devices', Array.from(devices.values()));
  });

  socket.on('send-file-request', ({ toDeviceId, ...data }) => {
    const receiver = devices.get(toDeviceId);
    if (receiver) {
      io.to(receiver.socketId).emit('file-request', data);
    }
  });

  socket.on('file-accepted', ({ toDeviceId, answer }) => {
    const sender = devices.get(toDeviceId);
    if (sender) {
      io.to(sender.socketId).emit('file-accepted', { answer });
    }
  });

  socket.on('ice-candidate', ({ toDeviceId, candidate }) => {
    const peer = devices.get(toDeviceId);
    if (peer) {
      io.to(peer.socketId).emit('ice-candidate', { candidate });
    }
  });

  socket.on('disconnect', () => {
    for (const [deviceId, device] of devices.entries()) {
      if (device.socketId === socket.id) {
        devices.delete(deviceId);
        break;
      }
    }
    io.emit('active-devices', Array.from(devices.values()));
    console.log('🔴 Disconnected:', socket.id);
  });
});

// === Routes (Optional health check) ===
app.get('/', (req, res) => {
  res.send('🌍 DropMesh backend is running');
});

// === Server Listen on 0.0.0.0 ===
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
