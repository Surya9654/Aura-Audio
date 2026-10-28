const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

class AuraRemoteServer {
  constructor() {
    this.server = null;
    this.wss = null;
    this.mainWindow = null;
    this.port = 4040;
    this.localIp = '127.0.0.1';
    this.connectedClients = new Set();
    this.currentState = {
      title: 'Aura Lossless Workstation',
      artist: 'Ready for Playback',
      album: 'Studio Reference',
      duration: 0,
      currentTime: 0,
      isPlaying: false,
      volume: 0.85,
      sampleRate: 44100,
      bitsPerSample: 16,
      format: 'FLAC',
      hasCover: false,
      coverData: null,
      dynamicRating: 'BALANCED',
      crestFactorDb: 10.5,
      activePreset: 'Reference',
      stereoMode: 'true-stereo',
      isBitPerfect: false
    };
    this.coverBuffer = null;
    this.coverMime = 'image/jpeg';
    this.coverTimestamp = Date.now();
    this.qrDataUrl = '';
  }

  // Detect the primary Wi-Fi / LAN IPv4 address of this machine
  detectLocalIp() {
    const interfaces = os.networkInterfaces();
    let candidateIps = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip loopback and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          candidateIps.push({ name, address: iface.address });
        }
      }
    }

    // Prioritize Wi-Fi or Ethernet LAN ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    const preferred = candidateIps.find(item => 
      item.address.startsWith('192.168.') || 
      item.address.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(item.address)
    );

    this.localIp = preferred ? preferred.address : (candidateIps[0] ? candidateIps[0].address : '127.0.0.1');
    return this.localIp;
  }

  get remoteUrl() {
    return `http://${this.localIp}:${this.port}`;
  }

  // Generate QR code for instant phone camera scanning
  async generateQrCode() {
    try {
      this.qrDataUrl = await QRCode.toDataURL(this.remoteUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        color: {
          dark: '#07090e',
          light: '#f5d485' // Warm metallic gold accent
        },
        width: 320
      });
    } catch (e) {
      console.error('Failed to generate QR code:', e);
      this.qrDataUrl = '';
    }
    return this.qrDataUrl;
  }

  start(mainWindow, desiredPort = 4040) {
    this.mainWindow = mainWindow;
    this.port = desiredPort;
    this.detectLocalIp();

    const remoteDir = path.join(__dirname, '../remote');

    this.server = http.createServer((req, res) => {
      // CORS headers for all API requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url, `http://localhost:${this.port}`);
      const pathname = parsedUrl.pathname;

      // 1. API: Current Playback State
      if (pathname === '/api/state') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Don't duplicate full base64 in state JSON; provide artwork URL endpoint
        const stateCopy = { ...this.currentState, coverUrl: `/api/artwork?t=${this.coverTimestamp}` };
        res.end(JSON.stringify(stateCopy));
        return;
      }

      // 2. API: Album Artwork image endpoint
      if (pathname === '/api/artwork') {
        if (this.coverBuffer) {
          res.writeHead(200, {
            'Content-Type': this.coverMime,
            'Content-Length': this.coverBuffer.length,
            'Cache-Control': 'public, max-age=3600'
          });
          res.end(this.coverBuffer);
        } else {
          // Serve transparent 1x1 GIF fallback
          const emptyGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
          res.writeHead(200, { 'Content-Type': 'image/gif' });
          res.end(emptyGif);
        }
        return;
      }

      // 3. API: Remote Info & QR Code
      if (pathname === '/api/info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ip: this.localIp,
          port: this.port,
          url: this.remoteUrl,
          connectedClients: this.connectedClients.size,
          qr: this.qrDataUrl
        }));
        return;
      }

      // 4. Static Files for Mobile Web App
      let filePath = path.join(remoteDir, pathname === '/' ? 'index.html' : pathname);
      // Prevent path traversal
      if (!filePath.startsWith(remoteDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon'
        };
        res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        // Fallback to index.html for SPA routing
        const fallback = path.join(remoteDir, 'index.html');
        if (fs.existsSync(fallback)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(fallback).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      }
    });

    // Attach WebSocket server on same HTTP instance
    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      // Enable TCP_NODELAY for sub-millisecond real-time packet delivery
      if (ws._socket && ws._socket.setNoDelay) {
        ws._socket.setNoDelay(true);
      }
      this.connectedClients.add(ws);
      console.log(`[Aura Remote]: Phone connected (${this.connectedClients.size} total active)`);
      this.notifyRendererClientCount();

      // Send initial state immediately upon phone connection
      const initialPayload = {
        type: 'state',
        data: {
          ...this.currentState,
          coverUrl: `/api/artwork?t=${this.coverTimestamp}`
        }
      };
      ws.send(JSON.stringify(initialPayload));

      ws.on('message', (message) => {
        try {
          const action = JSON.parse(message.toString());
          this.handleRemoteAction(action);
        } catch (err) {
          console.error('Remote WS message parse error:', err);
        }
      });

      ws.on('close', () => {
        this.connectedClients.delete(ws);
        console.log(`[Aura Remote]: Phone disconnected (${this.connectedClients.size} remaining)`);
        this.notifyRendererClientCount();
      });

      ws.on('error', () => {
        this.connectedClients.delete(ws);
        this.notifyRendererClientCount();
      });
    });

    // Start listening on 0.0.0.0 (all network interfaces)
    this.server.listen(this.port, '0.0.0.0', async () => {
      console.log(`[Aura 3.0 Mobile Remote]: Listening at ${this.remoteUrl}`);
      await this.generateQrCode();
      this.notifyRendererServerReady();
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[Aura Remote]: Port ${this.port} busy, trying ${this.port + 1}...`);
        this.start(this.mainWindow, this.port + 1);
      } else {
        console.error('[Aura Remote Server Error]:', err);
      }
    });
  }

  // Handle incoming commands sent from the mobile phone
  handleRemoteAction(action) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    console.log('[Aura Remote]: Action received from phone:', action);
    // Dispatch action to Electron renderer (app.js)
    this.mainWindow.webContents.send('remote-command', action);
  }

  // Called from renderer (app.js) whenever playback state updates
  updateState(state) {
    if (!state) return;

    // Check if new cover data was provided
    if (state.coverData) {
      try {
        if (state.coverData.startsWith('data:')) {
          const match = state.coverData.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            this.coverMime = match[1];
            this.coverBuffer = Buffer.from(match[2], 'base64');
            this.coverTimestamp = Date.now();
          }
        }
      } catch (e) {
        console.error('Error processing cover data for remote:', e);
      }
    } else if (state.coverData === null && !state.hasCover) {
      this.coverBuffer = null;
      this.coverTimestamp = Date.now();
    }

    // Update internal state cache (strip heavy base64 to keep memory and WS light)
    const cleanState = { ...state };
    delete cleanState.coverData;

    this.currentState = {
      ...this.currentState,
      ...cleanState
    };

    // Broadcast to all connected phones
    const payload = JSON.stringify({
      type: cleanState.isTick ? 'tick' : 'state',
      data: {
        ...this.currentState,
        coverUrl: `/api/artwork?t=${this.coverTimestamp}`
      }
    });

    for (const client of this.connectedClients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(payload);
      }
    }
  }

  notifyRendererClientCount() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('remote-clients-changed', {
        count: this.connectedClients.size,
        url: this.remoteUrl
      });
    }
  }

  notifyRendererServerReady() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('remote-server-ready', {
        ip: this.localIp,
        port: this.port,
        url: this.remoteUrl,
        qr: this.qrDataUrl
      });
    }
  }

  getServerInfo() {
    return {
      ip: this.localIp,
      port: this.port,
      url: this.remoteUrl,
      connectedClients: this.connectedClients.size,
      qr: this.qrDataUrl
    };
  }

  stop() {
    if (this.wss) {
      try { this.wss.close(); } catch (e) {}
    }
    if (this.server) {
      try { this.server.close(); } catch (e) {}
    }
    this.connectedClients.clear();
  }
}

module.exports = new AuraRemoteServer();
