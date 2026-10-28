const net = require('net');
const path = require('path');

const PIPE_NAME = '\\\\.\\pipe\\AuraPlayerWidgetPipe';

class WidgetBridge {
  constructor() {
    this.server = null;
    this.clients = new Set();
    this.mainWindow = null;

    this.currentState = {
      title: 'No Track Playing',
      artist: 'Aura Lossless Studio',
      album: 'Ready',
      coverUrl: '',
      badgeText: 'FLAC • 24-BIT • 96.0 kHz',
      telemetryInfo: '24-bit / 96.0 kHz Lossless',
      audioDeviceName: 'WASAPI Bit-Perfect Output',
      isPlaying: false,
      currentTime: 0,
      duration: 0
    };
  }

  init(mainWindow) {
    this.mainWindow = mainWindow;

    try {
      this.server = net.createServer((socket) => {
        console.log('[Widget Bridge] Native Windows 11 Widget Provider connected to Named Pipe.');
        this.clients.add(socket);

        // Send current track state immediately on connect
        this.sendStateToSocket(socket, this.currentState);

        let buffer = '';
        socket.on('data', (data) => {
          buffer += data.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep last incomplete segment

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed);
              this.handleWidgetAction(msg);
            } catch (err) {
              console.error('[Widget Bridge] Failed to parse message from native widget:', err);
            }
          }
        });

        socket.on('error', (err) => {
          console.log('[Widget Bridge] Socket error:', err.message);
        });

        socket.on('close', () => {
          console.log('[Widget Bridge] Widget Provider disconnected.');
          this.clients.delete(socket);
        });
      });

      this.server.on('error', (err) => {
        console.warn('[Widget Bridge] Named pipe server error (will retry or ignore):', err.message);
      });

      this.server.listen(PIPE_NAME, () => {
        console.log(`[Widget Bridge] IPC Named Pipe Server listening on ${PIPE_NAME}`);
      });
    } catch (err) {
      console.error('[Widget Bridge] Initialization error:', err);
    }
  }

  handleWidgetAction(msg) {
    const action = msg.action || msg.verb || msg.command;
    console.log(`[Widget Bridge] Received action from Windows 11 Widget: ${action}`);

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('widget-action', action);
    }
  }

  updateState(patch) {
    if (!patch) return;
    this.currentState = { ...this.currentState, ...patch };

    const payloadJson = JSON.stringify(this.currentState) + '\n';
    for (const client of this.clients) {
      try {
        if (!client.destroyed) {
          client.write(payloadJson);
        }
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  sendStateToSocket(socket, state) {
    try {
      if (socket && !socket.destroyed) {
        socket.write(JSON.stringify(state) + '\n');
      }
    } catch (err) {}
  }

  destroy() {
    for (const client of this.clients) {
      try { client.destroy(); } catch (e) {}
    }
    this.clients.clear();
    if (this.server) {
      try { this.server.close(); } catch (e) {}
    }
  }
}

module.exports = new WidgetBridge();
