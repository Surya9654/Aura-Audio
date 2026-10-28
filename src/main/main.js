const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { exec } = require('child_process');
const widgetBridge = require('./widget-bridge');
const remoteServer = require('./remote-server');

let mainWindow;
let streamServer;
let streamPort = 0;

// --- Persisted engine settings (read synchronously: command-line switches must be set before 'ready') ---
const SETTINGS_FILE = path.join(app.getPath('userData'), 'engine-settings.json');
function readEngineSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) { return {}; }
}
function writeEngineSettings(patch) {
  const next = { ...readEngineSettings(), ...patch };
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next));
  } catch (e) { console.error('Failed to save engine settings', e); }
  return next;
}

// Force GPU hardware acceleration and smooth scrolling/rendering
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist'); // Forces GPU acceleration even on older integrated graphics (Intel/AMD)

// Best-effort WASAPI exclusive mode: Chromium opens the output endpoint exclusively on its
// low-latency path, bypassing the Windows shared-mode mixer (and its resampling / volume curve)
// when the device accepts the stream format. Falls back to shared mode otherwise.
const exclusiveAudioEnabled = process.platform === 'win32' && !!readEngineSettings().exclusiveAudio;
if (exclusiveAudioEnabled) {
  app.commandLine.appendSwitch('enable-exclusive-audio');
}

// Read-ahead size for the local stream server (acts as a jitter buffer between disk and decoder)
const STREAM_BUFFER_BYTES = 1024 * 1024;

// Supported audio extensions
const AUDIO_EXTENSIONS = new Set(['.flac', '.wav', '.aiff', '.alac', '.m4a', '.mp3', '.ogg', '.aac', '.opus', '.dsf', '.dff']);

// Dedicated zero-overhead local HTTP streaming server with full byte-range support
function startStreamingServer() {
  return new Promise((resolve) => {
    streamServer = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url, `http://127.0.0.1:${streamPort || 5000}`);
        const rawFilePath = parsedUrl.searchParams.get('file');

        if (!rawFilePath || !fs.existsSync(rawFilePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        const ext = path.extname(rawFilePath).toLowerCase();
        const mimeTypes = {
          '.flac': 'audio/flac',
          '.wav': 'audio/wav',
          '.aiff': 'audio/aiff',
          '.mp3': 'audio/mpeg',
          '.m4a': 'audio/mp4',
          '.alac': 'audio/mp4',
          '.aac': 'audio/aac',
          '.ogg': 'audio/ogg',
          '.opus': 'audio/ogg'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const stat = fs.statSync(rawFilePath);
        const totalSize = stat.size;
        const range = req.headers.range;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Accept-Ranges', 'bytes');

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
          const chunkSize = (end - start) + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Content-Length': chunkSize,
            'Content-Type': contentType
          });

          const stream = fs.createReadStream(rawFilePath, { start, end, highWaterMark: STREAM_BUFFER_BYTES });
          stream.pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': totalSize,
            'Content-Type': contentType
          });

          const stream = fs.createReadStream(rawFilePath, { highWaterMark: STREAM_BUFFER_BYTES });
          stream.pipe(res);
        }
      } catch (err) {
        console.error('Streaming server error:', err);
        try {
          res.writeHead(500);
          res.end('Streaming error');
        } catch (e) {}
      }
    });

    streamServer.listen(0, '127.0.0.1', () => {
      streamPort = streamServer.address().port;
      console.log(`[Aura Streaming Engine] Local HTTP Audio Server active on 127.0.0.1:${streamPort}`);
      resolve(streamPort);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(15, 17, 21, 0.75)',
      symbolColor: '#e2e8f0',
      height: 38
    },
    backgroundMaterial: 'acrylic',
    backgroundColor: '#0a0c10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    show: false
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const src = sourceId ? path.basename(sourceId) : 'renderer';
    console.log(`[Renderer ${src}:${line}] ${message}`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`[Load Error] ${errorDescription} (${errorCode})`);
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Safety fallback in case ready-to-show does not fire
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 800);
}

// Windows native sound & DAC detection via PowerShell Get-PnpDevice / WMI AudioEndpoint
function detectAudioHardware() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const psCommand = `Get-CimInstance Win32_SoundDevice | Select-Object Name, DeviceID, Manufacturer, Status | ConvertTo-Json`;
      exec(`powershell -NoProfile -Command "${psCommand}"`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(getFallbackHardwareList());
          return;
        }
        try {
          let parsed = JSON.parse(stdout);
          if (!Array.isArray(parsed)) parsed = [parsed];
          const dacs = parsed.map(dev => {
            const name = dev.Name || 'Unknown Audio Device';
            const isUsbOrDAC = /dac|usb|fiio|topping|schiit|audioquest|chord|astell|moondrop|qudelix|ifiaudio|hifiman|focusrite|motu|rme|zen/i.test(name + ' ' + (dev.Manufacturer || ''));
            return {
              name,
              id: dev.DeviceID,
              manufacturer: dev.Manufacturer,
              isDAC: isUsbOrDAC,
              type: isUsbOrDAC ? 'External Audiophile DAC / Interface' : 'Internal Audio Chipset / Realtek'
            };
          });
          resolve(dacs);
        } catch (e) {
          resolve(getFallbackHardwareList());
        }
      });
    } else {
      resolve(getFallbackHardwareList());
    }
  });
}

function getFallbackHardwareList() {
  return [
    { name: 'System Default Audio Output', isDAC: false, type: 'System Output' }
  ];
}

let mmParseFile = null;
async function getMusicMetadataParser() {
  if (mmParseFile) return mmParseFile;
  try {
    const mm = await import('music-metadata');
    mmParseFile = mm.parseFile;
  } catch (err) {
    console.error('Failed to import music-metadata', err);
  }
  return mmParseFile;
}

// Parse single audio file metadata
async function parseAudioFileMetadata(fullPath) {
  const ext = path.extname(fullPath).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) return null;

  let meta = {
    title: path.basename(fullPath, ext).replace(/[_-]/g, ' '),
    artist: 'Aura Lossless Studio',
    album: 'Audiophile Master Session',
    duration: 0,
    sampleRate: 44100,
    bitsPerSample: 16,
    bitrate: 0,
    format: ext.replace('.', '').toUpperCase(),
    path: fullPath,
    size: 0,
    hasCover: false,
    coverData: null
  };

  try {
    const stats = await fs.promises.stat(fullPath);
    meta.size = stats.size;

    const parseFile = await getMusicMetadataParser();
    if (parseFile) {
      const metadata = await parseFile(fullPath, { duration: true, skipCovers: false });
      if (metadata.common) {
        if (metadata.common.title) meta.title = metadata.common.title;
        if (metadata.common.artist) meta.artist = metadata.common.artist;
        if (metadata.common.album) meta.album = metadata.common.album;
        if (metadata.common.year) meta.year = metadata.common.year;
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          const pic = metadata.common.picture[0];
          const picBuf = Buffer.from(pic.data);
          meta.hasCover = true;
          try {
            const img = nativeImage.createFromBuffer(picBuf);
            if (img.isEmpty()) throw new Error('empty');
            const size = img.getSize();
            const resized = size.width > 600 ? img.resize({ width: 600, quality: 'best' }) : img;
            meta.coverData = `data:image/jpeg;base64,${resized.toJPEG(90).toString('base64')}`;
          } catch (e) {
            meta.coverData = `data:${pic.format || 'image/jpeg'};base64,${picBuf.toString('base64')}`;
          }
        }
      }
      if (metadata.format) {
        if (metadata.format.duration) meta.duration = metadata.format.duration;
        if (metadata.format.sampleRate) meta.sampleRate = metadata.format.sampleRate;
        if (metadata.format.bitsPerSample) meta.bitsPerSample = metadata.format.bitsPerSample;
        if (metadata.format.bitrate) meta.bitrate = Math.round(metadata.format.bitrate / 1000);
        if (metadata.format.container) {
          meta.format = metadata.format.container.toUpperCase();
        }
        if (ext === '.flac') {
          meta.format = 'FLAC';
        }
      }
    }

    if (!meta.hasCover) {
      const coverNames = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'artwork.jpg', 'album.jpg'];
      const fileDir = path.dirname(fullPath);
      for (const cName of coverNames) {
        const testCoverPath = path.join(fileDir, cName);
        if (fs.existsSync(testCoverPath)) {
          try {
            const imgData = await fs.promises.readFile(testCoverPath);
            const mime = cName.endsWith('.png') ? 'image/png' : 'image/jpeg';
            meta.hasCover = true;
            meta.coverData = `data:${mime};base64,${imgData.toString('base64')}`;
            break;
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    // Keep base metadata
  }
  return meta;
}

// Parse an arbitrary list of file or folder paths
async function parseAudioFilesList(filePaths) {
  let tracks = [];
  for (const fp of filePaths) {
    try {
      if (!fs.existsSync(fp)) continue;
      const stat = await fs.promises.stat(fp);
      if (stat.isDirectory()) {
        const subTracks = await scanDirectoryRecursive(fp, 5);
        tracks = tracks.concat(subTracks);
      } else if (stat.isFile()) {
        const track = await parseAudioFileMetadata(fp);
        if (track) tracks.push(track);
      }
    } catch (err) {
      console.warn('Error parsing input file:', fp, err);
    }
  }
  return tracks;
}

// Recursive audio scanner with metadata parsing
async function scanDirectoryRecursive(dirPath, maxDepth = 4, currentDepth = 0) {
  let results = [];
  if (currentDepth > maxDepth) return results;

  let entries;
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const SKIP_DIRS = new Set(['node_modules', 'appdata', '$recycle.bin', 'windows', 'program files', 'program files (x86)', 'programdata', 'onedrive - cache', '.git']);
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      const subResults = await scanDirectoryRecursive(fullPath, maxDepth, currentDepth + 1);
      results = results.concat(subResults);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS.has(ext)) {
        const meta = await parseAudioFileMetadata(fullPath);
        if (meta) results.push(meta);
      }
    }
  }
  return results;
}

// IPC Handlers
ipcMain.handle('get-system-info', () => {
  return {
    platform: process.platform,
    hostname: os.hostname(),
    musicDir: path.join(os.homedir(), 'Music'),
    userHome: os.homedir(),
    appRoot: path.resolve(__dirname, '../../'),
    streamPort: streamPort
  };
});

ipcMain.handle('get-stream-port', () => {
  return streamPort;
});

ipcMain.handle('get-engine-settings', () => ({
  exclusiveAudio: !!readEngineSettings().exclusiveAudio,
  exclusiveActive: exclusiveAudioEnabled,
  platform: process.platform
}));

// Takes effect after restart (Chromium audio switches are read at launch)
ipcMain.handle('set-exclusive-audio', (event, enabled) => {
  writeEngineSettings({ exclusiveAudio: !!enabled });
  return { saved: true, restartRequired: !!enabled !== exclusiveAudioEnabled };
});

ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('detect-hardware-dacs', async () => {
  return await detectAudioHardware();
});

ipcMain.handle('select-music-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Music Library Folder'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-music-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Select Lossless Audio Files',
    filters: [
      { name: 'Audio Files (*.flac, *.wav, *.aiff, *.alac, *.mp3, etc.)', extensions: ['flac', 'wav', 'aiff', 'alac', 'm4a', 'mp3', 'ogg', 'aac', 'opus', 'dsf', 'dff'] },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return await parseAudioFilesList(result.filePaths);
});

ipcMain.handle('parse-audio-files', async (event, filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return [];
  return await parseAudioFilesList(filePaths);
});

ipcMain.handle('scan-directory', async (event, dirPath) => {
  const targetDir = dirPath || path.join(os.homedir(), 'Music');
  return await scanDirectoryRecursive(targetDir, 5);
});

ipcMain.handle('open-file-location', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// Windows Audio Endpoints & Bluetooth Devices Detection (Aura Connect)
function getWindowsAudioEndpointsAndBluetooth() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ outputs: [], bluetooth: [] });
      return;
    }

    const psCommand = `
      $endpoints = Get-PnpDevice -Class AudioEndpoint | Select-Object FriendlyName, Status, InstanceId | ConvertTo-Json -Compress
      $bluetooth = Get-PnpDevice -Class Bluetooth | Select-Object FriendlyName, Status, InstanceId | ConvertTo-Json -Compress
      [PSCustomObject]@{ Endpoints = $endpoints; Bluetooth = $bluetooth } | ConvertTo-Json -Compress
    `.replace(/\r?\n/g, ' ');

    exec(`powershell -NoProfile -Command "${psCommand}"`, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve({ outputs: [], bluetooth: [] });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        let epList = [];
        let btList = [];
        try { epList = JSON.parse(parsed.Endpoints); } catch (e) {}
        try { btList = JSON.parse(parsed.Bluetooth); } catch (e) {}
        if (!Array.isArray(epList)) epList = epList ? [epList] : [];
        if (!Array.isArray(btList)) btList = btList ? [btList] : [];

        // Filter output endpoints ({0.0.0. represents audio render/playback outputs)
        const outputs = epList
          .filter(e => e.InstanceId && e.InstanceId.includes('{0.0.0.'))
          .map(e => {
            const name = e.FriendlyName || 'Audio Output';
            const isBt = /bluetooth|wireless|buds|soundbar|hands-free|wh-|airpods/i.test(name) || (e.InstanceId && e.InstanceId.includes('BTH'));
            const isDac = /dac|usb|fiio|topping|schiit|chord|audiocular|ab13x|focusrite/i.test(name);
            return {
              name,
              id: e.InstanceId,
              status: e.Status || 'Unknown',
              isActive: e.Status === 'OK',
              type: isDac ? 'Hi-Res Lossless DAC' : (isBt ? 'Bluetooth Audio' : 'Internal Speakers / Chipset'),
              icon: isBt ? 'bluetooth' : (isDac ? 'dac' : 'speaker')
            };
          });

        // Filter distinct paired / connected Bluetooth devices
        const seen = new Set();
        const bluetooth = btList
          .filter(b => {
            const name = b.FriendlyName || '';
            const skip = /generic attribute|generic access|transport|radio|adapter|module|service|nap/i.test(name);
            if (skip || seen.has(name.toLowerCase())) return false;
            seen.add(name.toLowerCase());
            return true;
          })
          .map(b => ({
            name: b.FriendlyName,
            status: b.Status,
            isConnected: b.Status === 'OK',
            id: b.InstanceId
          }));

        resolve({ outputs, bluetooth });
      } catch (e) {
        console.error('Error parsing endpoints:', e);
        resolve({ outputs: [], bluetooth: [] });
      }
    });
  });
}

// Windows 11 Widget Board IPC
ipcMain.on('widget-update-state', (event, state) => {
  widgetBridge.updateState(state);
});

// Aura 3.0 Mobile Wi-Fi Remote (Connect) IPC
ipcMain.handle('get-remote-info', () => {
  return remoteServer.getServerInfo();
});

ipcMain.on('remote-update-state', (event, state) => {
  remoteServer.updateState(state);
});

ipcMain.on('remote-update-library', (event, libraryTracks) => {
  remoteServer.updateLibrary(libraryTracks);
});

ipcMain.handle('get-connected-devices', async () => {
  return await getWindowsAudioEndpointsAndBluetooth();
});

app.whenReady().then(async () => {
  await startStreamingServer();
  createWindow();
  widgetBridge.init(mainWindow);
  remoteServer.start(mainWindow, 4040);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  widgetBridge.destroy();
  remoteServer.stop();
  if (streamServer) {
    try { streamServer.close(); } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
