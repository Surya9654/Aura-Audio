const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const VIRTUAL_IFACE_PATTERN = /vethernet|wsl|vmware|virtualbox|vbox|hyper-v|loopback|docker|tailscale|zerotier|tun|tap|vpn|bluetooth|npcap|teredo|isatap/i;
const WIFI_IFACE_PATTERN = /wi-?fi|wlan|wireless|airport|802\.11/i;

class AuraRemoteServer {
  constructor() {
    this.server = null;
    this.wss = null;
    this.mainWindow = null;
    this.port = 4040;
    this.localIp = '127.0.0.1';
    this.interfaceName = 'Loopback';
    this.wifiSsid = '';
    this.isOffline = true;
    this.allAdapters = [];
    this.preferredIpOverride = null;
    this.networkWatcherTimer = null;
    this.lastSsidCheckAt = 0;
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
    this.currentLibrary = [];
    this.coverCache = new Map();
  }

  // Query OS routing table via local UDP socket connect (sends zero packets on the network)
  probeOutboundIp() {
    return new Promise((resolve) => {
      let settled = false;
      const done = (ip) => {
        if (!settled) {
          settled = true;
          resolve(ip || null);
        }
      };
      try {
        const sock = dgram.createSocket('udp4');
        sock.once('error', () => {
          try { sock.close(); } catch (e) {}
          done(null);
        });
        sock.connect(53, '8.8.8.8', () => {
          let addr = null;
          try { addr = sock.address().address; } catch (e) {}
          try { sock.close(); } catch (e) {}
          done(addr && addr !== '127.0.0.1' && addr !== '0.0.0.0' ? addr : null);
        });
        setTimeout(() => {
          try { sock.close(); } catch (e) {}
          done(null);
        }, 250);
      } catch (e) {
        done(null);
      }
    });
  }

  isPrivateLanIp(address) {
    return (
      address.startsWith('192.168.') ||
      address.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(address)
    );
  }

  // Scan all OS network interfaces and rank active Wi-Fi / LAN adapters
  scanNetworkInterfaces(routedIp = null) {
    const interfaces = os.networkInterfaces();
    const candidates = [];

    for (const name of Object.keys(interfaces)) {
      const list = interfaces[name] || [];
      for (const iface of list) {
        if (iface.family !== 'IPv4' || iface.internal) continue;
        if (!iface.address || iface.address.startsWith('169.254.')) continue; // Skip link-local APIPA

        const isVirtual = VIRTUAL_IFACE_PATTERN.test(name);
        const isWifi = !isVirtual && WIFI_IFACE_PATTERN.test(name);
        const isLan = this.isPrivateLanIp(iface.address);
        const isRouted = routedIp && iface.address === routedIp;

        let score = 0;
        if (!isVirtual) score += 100;
        if (isLan) score += 50;
        if (isWifi) score += 40;     // Prefer Wi-Fi since phones connect over Wi-Fi
        if (isRouted) score += 45;   // Prefer OS active default-route interface

        candidates.push({
          name,
          address: iface.address,
          isWifi,
          isVirtual,
          isLan,
          isRouted,
          score
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const physicalAdapters = candidates.filter(c => !c.isVirtual);
    const activeList = physicalAdapters.length > 0 ? physicalAdapters : candidates;

    // Clear manual override if that IP is no longer present on the machine
    if (this.preferredIpOverride && !candidates.some(c => c.address === this.preferredIpOverride)) {
      this.preferredIpOverride = null;
    }

    const chosen = (this.preferredIpOverride && candidates.find(c => c.address === this.preferredIpOverride))
      || activeList[0]
      || null;

    return {
      ip: chosen ? chosen.address : '127.0.0.1',
      interfaceName: chosen ? chosen.name : 'Offline',
      isWifi: chosen ? chosen.isWifi : false,
      isOffline: !chosen,
      adapters: activeList.map(a => ({
        name: a.name,
        ip: a.address,
        isWifi: a.isWifi,
        isRouted: a.isRouted,
        url: `http://${a.address}:${this.port}`
      }))
    };
  }

  // Synchronous initial fallback IP check
  detectLocalIp() {
    const res = this.scanNetworkInterfaces(null);
    this.localIp = res.ip;
    this.interfaceName = res.interfaceName;
    this.isOffline = res.isOffline;
    this.allAdapters = res.adapters;
    return this.localIp;
  }

  // Detect active Wi-Fi SSID / Network Profile name without blocking the event loop
  detectWifiSsid(ifaceName = 'Wi-Fi') {
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        exec('netsh wlan show interfaces', { timeout: 1500, windowsHide: true }, (err, stdout) => {
          if (!err && stdout) {
            const lines = stdout.split(/\r?\n/);
            let connected = false;
            for (const line of lines) {
              if (/^\s*State\s*:\s*connected/i.test(line)) {
                connected = true;
              } else if (connected && /^\s*(?:SSID|Profile)\s*:\s*(.+)$/i.test(line)) {
                const m = line.match(/^\s*(?:SSID|Profile)\s*:\s*(.+)$/i);
                if (m && m[1] && m[1].trim()) {
                  return resolve(m[1].trim());
                }
              }
            }
          }
          // Fallback on Windows 11 when Location Services hide SSID from netsh: read NetConnectionProfile Name
          const safeAlias = String(ifaceName || 'Wi-Fi').replace(/'/g, "''");
          exec(
            `powershell -NoProfile -Command "(Get-NetConnectionProfile -InterfaceAlias '${safeAlias}' -ErrorAction SilentlyContinue | Select-Object -First 1).Name"`,
            { timeout: 4500, windowsHide: true },
            (psErr, psOut) => {
              if (psErr || !psOut) return resolve('');
              resolve(psOut.trim());
            }
          );
        });
      } else {
        resolve('');
      }
    });
  }

  // Live network check: detects Wi-Fi switches, dongle plug/unplug, or DHCP IP updates automatically
  async refreshNetwork(forceQr = false) {
    const prevIp = this.localIp;
    const prevIface = this.interfaceName;
    const prevSsid = this.wifiSsid;
    const prevAdaptersSig = JSON.stringify(this.allAdapters.map(a => a.ip));

    const routedIp = await this.probeOutboundIp();
    const scan = this.scanNetworkInterfaces(routedIp);

    this.localIp = scan.ip;
    this.interfaceName = scan.interfaceName;
    this.isOffline = scan.isOffline;
    this.allAdapters = scan.adapters;

    const ipOrIfaceChanged = (this.localIp !== prevIp) || (this.interfaceName !== prevIface);
    const now = Date.now();

    if (scan.isOffline) {
      this.wifiSsid = '';
    } else if (scan.isWifi && (ipOrIfaceChanged || forceQr || now - this.lastSsidCheckAt > 10000)) {
      this.lastSsidCheckAt = now;
      this.wifiSsid = await this.detectWifiSsid(this.interfaceName);
    } else if (!scan.isWifi) {
      this.wifiSsid = '';
    }

    const ssidChanged = this.wifiSsid !== prevSsid;
    const adaptersChanged = JSON.stringify(this.allAdapters.map(a => a.ip)) !== prevAdaptersSig;

    if (ipOrIfaceChanged || forceQr || !this.qrDataUrl) {
      await this.generateQrCode();
    }

    if (ipOrIfaceChanged || ssidChanged || adaptersChanged || forceQr) {
      if (ipOrIfaceChanged || adaptersChanged) {
        this.refreshMdnsMemberships();
      }
      if (ipOrIfaceChanged) {
        console.log(`[Aura Remote]: Network adapted -> ${this.interfaceName}${this.wifiSsid ? ' (' + this.wifiSsid + ')' : ''} @ ${this.remoteUrl}`);
      }
      this.notifyRendererServerReady();
      this.broadcastNetworkInfoToClients();
    }

    return this.getServerInfo();
  }

  async selectAdapterIp(ip) {
    this.preferredIpOverride = ip || null;
    return await this.refreshNetwork(true);
  }

  startNetworkWatcher() {
    if (this.networkWatcherTimer) clearInterval(this.networkWatcherTimer);
    this.networkWatcherTimer = setInterval(() => {
      this.refreshNetwork(false).catch(() => {});
    }, 3000);
  }

  get hostnameUrl() {
    const rawHost = os.hostname();
    if (!rawHost) return '';
    const cleanHost = rawHost.endsWith('.local') ? rawHost : `${rawHost}.local`;
    return `http://${cleanHost.toLowerCase()}:${this.port}`;
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
      // CORS + Private Network Access headers so phones can discover new Wi-Fi IPs across origins
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');

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

      // 1b. API: Music Library
      if (pathname === '/api/library') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          tracks: this.currentLibrary,
          count: this.currentLibrary.length
        }));
        return;
      }

      // 1c. API: Track Artwork On-Demand
      if (pathname === '/api/track-art') {
        const filePath = parsedUrl.searchParams.get('path');
        const indexStr = parsedUrl.searchParams.get('index');

        let targetTrack = null;
        if (filePath) {
          targetTrack = this.currentLibrary.find(t => t.path === filePath);
        } else if (indexStr !== null) {
          const idx = parseInt(indexStr, 10);
          if (!isNaN(idx) && this.currentLibrary[idx]) {
            targetTrack = this.currentLibrary[idx];
          }
        }

        const fallback = () => {
          const emptyGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
          res.writeHead(200, { 'Content-Type': 'image/gif' });
          res.end(emptyGif);
        };

        if (targetTrack && targetTrack.path) {
          if (this.coverCache.has(targetTrack.path)) {
            const cached = this.coverCache.get(targetTrack.path);
            res.writeHead(200, {
              'Content-Type': cached.mime,
              'Content-Length': cached.buffer.length,
              'Cache-Control': 'public, max-age=86400'
            });
            res.end(cached.buffer);
            return;
          }

          if (this.currentState && this.currentState.path === targetTrack.path && this.coverBuffer) {
            res.writeHead(200, {
              'Content-Type': this.coverMime,
              'Content-Length': this.coverBuffer.length,
              'Cache-Control': 'public, max-age=86400'
            });
            res.end(this.coverBuffer);
            return;
          }

          try {
            const dir = path.dirname(targetTrack.path);
            const coverNames = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'artwork.jpg', 'album.jpg'];
            let foundImg = null;
            let foundMime = 'image/jpeg';
            for (const cn of coverNames) {
              const testP = path.join(dir, cn);
              if (fs.existsSync(testP)) {
                foundImg = fs.readFileSync(testP);
                foundMime = cn.endsWith('.png') ? 'image/png' : 'image/jpeg';
                break;
              }
            }
            if (foundImg) {
              this.coverCache.set(targetTrack.path, { mime: foundMime, buffer: foundImg });
              res.writeHead(200, {
                'Content-Type': foundMime,
                'Content-Length': foundImg.length,
                'Cache-Control': 'public, max-age=86400'
              });
              res.end(foundImg);
              return;
            }
          } catch (e) {}
        }

        fallback();
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

      // 3. API: Remote Info & QR Code (refreshes active network interfaces live)
      if (pathname === '/api/info') {
        this.refreshNetwork(false).then((info) => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(info));
        }).catch(() => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(this.getServerInfo()));
        });
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

      // Send network identity so phone remembers mDNS hostname & active LAN IPs
      ws.send(JSON.stringify({
        type: 'network-info',
        data: this.getServerInfo()
      }));

      // Send current library upon phone connection
      if (this.currentLibrary && this.currentLibrary.length > 0) {
        ws.send(JSON.stringify({
          type: 'library',
          data: this.currentLibrary
        }));
      }

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

    // Start listening on 0.0.0.0 (all network interfaces, including newly attached Wi-Fi adapters)
    this.server.listen(this.port, '0.0.0.0', async () => {
      await this.refreshNetwork(true);
      console.log(`[Aura 3.0 Mobile Remote]: Listening on 0.0.0.0:${this.port} -> Active: ${this.remoteUrl} (${this.interfaceName}${this.wifiSsid ? ' / ' + this.wifiSsid : ''})`);
      this.startMdnsResponder();
      this.startNetworkWatcher();
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[Aura Remote]: Port ${this.port} busy, trying ${this.port + 1}...`);
        try { if (this.wss) this.wss.close(); } catch (e) {}
        try { if (this.server) this.server.close(); } catch (e) {}
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

  updateLibrary(tracks) {
    if (!Array.isArray(tracks)) return;
    this.currentLibrary = tracks;
    console.log(`[Aura Remote]: Synced library with ${tracks.length} track(s)`);

    const payload = JSON.stringify({
      type: 'library',
      data: this.currentLibrary
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

  broadcastNetworkInfoToClients() {
    const payload = JSON.stringify({
      type: 'network-info',
      data: this.getServerInfo()
    });
    for (const client of this.connectedClients) {
      if (client.readyState === 1) {
        try { client.send(payload); } catch (e) {}
      }
    }
  }

  notifyRendererServerReady() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('remote-server-ready', this.getServerInfo());
    }
  }

  // Lightweight zero-dependency mDNS responder (224.0.0.251:5353) so http://aura.local:4040
  // and http://<hostname>.local:4040 resolve to the current Wi-Fi IP on any network.
  startMdnsResponder() {
    if (this.mdnsSocket) return;
    try {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.mdnsSocket = sock;

      sock.on('error', () => {
        // Non-fatal if OS mDNS service holds exclusive lock; OS native .local still works
      });

      sock.on('message', (msg) => {
        try {
          if (!msg || msg.length < 12 || this.isOffline || !this.localIp || this.localIp === '127.0.0.1') return;
          const flags = msg.readUInt16BE(2);
          if ((flags & 0x8000) !== 0) return; // Ignore responses, only answer queries
          const qdCount = msg.readUInt16BE(4);
          if (qdCount === 0) return;

          // Parse first DNS question QNAME
          let offset = 12;
          const labels = [];
          while (offset < msg.length) {
            const len = msg[offset];
            if (len === 0) {
              offset += 1;
              break;
            }
            if ((len & 0xc0) === 0xc0) {
              offset += 2;
              break;
            }
            offset += 1;
            if (offset + len > msg.length) return;
            labels.push(msg.slice(offset, offset + len).toString('utf8').toLowerCase());
            offset += len;
          }
          if (offset + 4 > msg.length) return;
          const qType = msg.readUInt16BE(offset); // 1 = A, 255 = ANY
          if (qType !== 1 && qType !== 255) return;

          const qName = labels.join('.');
          const hostClean = (os.hostname() || '').toLowerCase().replace(/\.local$/, '');
          const acceptedNames = new Set(['aura.local', 'aura-remote.local']);
          if (hostClean) acceptedNames.add(`${hostClean}.local`);

          if (!acceptedNames.has(qName)) return;

          const ipParts = this.localIp.split('.').map(n => parseInt(n, 10));
          if (ipParts.length !== 4 || ipParts.some(n => isNaN(n) || n < 0 || n > 255)) return;

          // Build minimal mDNS A-record response (TTL 30s so Wi-Fi IP changes propagate rapidly)
          const nameBytes = [];
          for (const part of qName.split('.')) {
            const b = Buffer.from(part, 'utf8');
            nameBytes.push(Buffer.from([b.length]), b);
          }
          nameBytes.push(Buffer.from([0]));
          const encodedName = Buffer.concat(nameBytes);

          const header = Buffer.alloc(12);
          header.writeUInt16BE(0, 0);      // ID = 0 for mDNS
          header.writeUInt16BE(0x8400, 2); // QR=1, AA=1
          header.writeUInt16BE(0, 4);      // QDCOUNT = 0
          header.writeUInt16BE(1, 6);      // ANCOUNT = 1
          header.writeUInt16BE(0, 8);
          header.writeUInt16BE(0, 10);

          const rrMeta = Buffer.alloc(10);
          rrMeta.writeUInt16BE(1, 0);      // TYPE A
          rrMeta.writeUInt16BE(0x8001, 2); // CLASS IN + cache-flush
          rrMeta.writeUInt32BE(30, 4);     // TTL = 30 seconds
          rrMeta.writeUInt16BE(4, 8);      // RDLENGTH = 4

          const rdata = Buffer.from(ipParts);
          const packet = Buffer.concat([header, encodedName, rrMeta, rdata]);
          sock.send(packet, 5353, '224.0.0.251');
        } catch (e) {}
      });

      sock.bind(5353, '0.0.0.0', () => {
        this.refreshMdnsMemberships();
      });
    } catch (e) {}
  }

  refreshMdnsMemberships() {
    if (!this.mdnsSocket) return;
    try {
      this.mdnsSocket.addMembership('224.0.0.251');
    } catch (e) {}
    for (const ad of (this.allAdapters || [])) {
      if (ad && ad.ip && ad.ip !== '127.0.0.1') {
        try {
          this.mdnsSocket.addMembership('224.0.0.251', ad.ip);
        } catch (e) {}
      }
    }
  }

  get auraLocalUrl() {
    return `http://aura.local:${this.port}`;
  }

  getServerInfo() {
    return {
      app: 'aura-remote',
      ip: this.localIp,
      port: this.port,
      url: this.remoteUrl,
      auraLocalUrl: this.auraLocalUrl,
      hostname: os.hostname() || '',
      hostnameUrl: this.hostnameUrl,
      interfaceName: this.interfaceName,
      ssid: this.wifiSsid,
      isOffline: this.isOffline,
      adapters: this.allAdapters,
      connectedClients: this.connectedClients.size,
      qr: this.qrDataUrl
    };
  }

  stop() {
    if (this.networkWatcherTimer) {
      clearInterval(this.networkWatcherTimer);
      this.networkWatcherTimer = null;
    }
    if (this.mdnsSocket) {
      try { this.mdnsSocket.close(); } catch (e) {}
      this.mdnsSocket = null;
    }
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
