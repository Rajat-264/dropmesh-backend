const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const os = require('os');

const app = express();
const server = http.createServer(app);

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const preferred = [];

  for (const [name, iface] of Object.entries(interfaces)) {
    if (
      name.toLowerCase().includes('loopback') ||
      name.toLowerCase().includes('vmware') ||
      name.toLowerCase().includes('virtual') ||
      name.toLowerCase().includes('vbox') ||
      name.toLowerCase().includes('wsl') ||
      name.toLowerCase().includes('docker')
    ) {
      continue;
    }
    for (const config of iface) {
      if (config.family === 'IPv4' && !config.internal) {
        if (
          name.toLowerCase().includes('wi-fi') ||
          name.toLowerCase().includes('wlan') ||
          name.toLowerCase().includes('eth') ||
          name.toLowerCase().includes('en')
        ) {
          preferred.push(config.address);
        }
      }
    }
  }
  if (preferred.length > 0) return preferred[0];

  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === 'IPv4' && !config.internal) {
        return config.address;
      }
    }
  }
  return '0.0.0.0';
}

const localIp = getLocalIp();
const io = socketIo(server, {
  cors: {
    origin: `http://${localIp}:5173`,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

const devices = new Map();

app.use(cors());
app.use(express.json());

app.get('/api/ip', (req, res) => {
  res.json({ ip: localIp });
});

app.get('/api/network-info', (req, res) => {
  res.json({ ip: localIp });
});

io.on('connection', (socket) => {
  console.log('New socket connected:', socket.id);

  socket.on('register-device', ({ deviceId, username }) => {
    console.log(`Device registered: ${username} (${deviceId})`);
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
  });
});

const PORT = 3000;
server.listen(PORT, localIp, () => {
  console.log(`🚀 Server running on:
  - Local: http://localhost:${PORT}
  - Network: http://${localIp}:${PORT}`);
  
  console.log(`\nQR Code should point to: http://${localIp}:${PORT}`);
});