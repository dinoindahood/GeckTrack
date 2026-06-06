const { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu } = require('electron');
const { spawn, exec } = require('child_process'); // Added exec for the Ghostbuster
const path = require('node:path');

app.disableHardwareAcceleration();

// ── 1. THE SINGLE INSTANCE LOCK ───────────────────────────────────────────────
// Ask the system: "Am I the first app?"
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // If we are the second app, instantly commit seppuku.
  app.quit();
} else {
  // If a user tries to open a second app, violently shake the first one to the front!
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
// ──────────────────────────────────────────────────────────────────────────────

let mainWindow   = null;
let tray         = null;
let pythonServer = null;

// ── icon helper ───────────────────────────────────────────────────────────────
function getIcon(filename) {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'data', 'icons', filename)
    : path.join(__dirname, 'data', 'icons', filename);

  let img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    console.error(`Icon not found: ${iconPath}`);
    return img;
  }
  return img.resize({ width: 16, height: 16 });
}

// ── window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'ui', 'assets', 'img', 'app-icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.setThumbarButtons([
      { tooltip: 'Previous', icon: getIcon('prev.png'),  click() { mainWindow.webContents.send('thumbar-command', 'prev');  } },
      { tooltip: 'Play',     icon: getIcon('play.png'),  click() { mainWindow.webContents.send('thumbar-command', 'play');  } },
      { tooltip: 'Next',     icon: getIcon('next.png'),  click() { mainWindow.webContents.send('thumbar-command', 'next');  } },
    ]);
  });

  // When the user clicks the Red X, kill the Python server synchronously first.
  // app.quit() returns immediately — we can't rely on before-quit/will-quit
  // because the app exits before the async exec() finishes.
  mainWindow.on('close', () => {
    app.isQuitting = true;
    // Kill the child process directly
    if (pythonServer) {
      pythonServer.removeAllListeners();
      pythonServer.kill('SIGTERM');
      pythonServer = null;
    }
    // Kill any process holding port 5000 — use sync exec on Windows
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try {
        execSync(
          `for /f "tokens=5" %a in ('netstat -aon ^| findstr :5000') do taskkill /F /PID %a`,
          { stdio: 'ignore', timeout: 3000 }
        );
      } catch (_) { /* Server already dead — that's fine */ }
    }
    app.exit(0);
  });
}

// ── system tray ───────────────────────────────────────────────────────────────
function createTray() {
  // FIX: Because UI is packed inside the ASAR zip, process.resourcesPath will fail here!
  // __dirname works perfectly for internal assets like tray icons.
  const trayIconPath = path.join(__dirname, 'ui', 'assets', 'img', 'tray-icon.png');

  tray = new Tray(trayIconPath);
  tray.setToolTip('GeckTrack Music Player');

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show App',    click: () => mainWindow.show()  },
    { label: 'Play/Pause',  click: () => mainWindow.webContents.send('thumbar-command', 'play') },
    { type: 'separator' },
    { label: 'Quit GeckTrack', click: () => { app.isQuitting = true; app.quit(); } },
  ]));

  tray.on('double-click', () => mainWindow.show());
}

// ── thumbar IPC ───────────────────────────────────────────────────────────────
ipcMain.on('update-thumbar', (event, isPlaying) => {
  if (!mainWindow) return;
  mainWindow.setThumbarButtons([
    { tooltip: 'Previous',                    icon: getIcon('prev.png'),                           click() { mainWindow.webContents.send('thumbar-command', 'prev');  } },
    { tooltip: isPlaying ? 'Pause' : 'Play',  icon: getIcon(isPlaying ? 'pause.png' : 'play.png'), click() { mainWindow.webContents.send('thumbar-command', isPlaying ? 'pause' : 'play'); } },
    { tooltip: 'Next',                        icon: getIcon('next.png'),                           click() { mainWindow.webContents.send('thumbar-command', 'next');  } },
  ]);
});

// ── python server ─────────────────────────────────────────────────────────────
function startPythonServer() {
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'server.exe')
    : path.join(__dirname, 'server.py'); // Dev mode: run .py directly, not .exe

  const serverArgs = app.isPackaged ? [] : [path.join(__dirname, 'server.py')];
  const execCmd    = app.isPackaged ? serverPath : 'python';

  pythonServer = spawn(execCmd, serverArgs, { detached: false });
  pythonServer.stdout.on('data', (d) => console.log(`[Python] ${d}`));
  pythonServer.stderr.on('data', (d) => console.error(`[Python ERR] ${d}`));
  pythonServer.on('error',  (e)  => console.error(`Failed to start server: ${e.message}`));
  pythonServer.on('exit',  (code, sig) => {
    console.log(`[Python] server exited with code=${code} signal=${sig}`);
    pythonServer = null;
  });
}

function killPythonServer() {
  if (pythonServer) {
    pythonServer.removeAllListeners();
    pythonServer.kill('SIGTERM');
    pythonServer = null;
  }
  // ── 2. THE TERMINATOR PROTOCOL ──
  // Kill any lingering server.exe OR python.exe processes on port 5000.
  // /FI filters to only processes listening on port 5000 — no collateral damage.
  if (process.platform === 'win32') {
    exec(
      `for /f "tokens=5" %a in ('netstat -aon ^| findstr :5000') do taskkill /F /PID %a`,
      (err, stdout, stderr) => {
        // Suppress errors — server might already be dead, that's fine.
        if (err && !err.message.includes('no processes')) {
          console.warn('[Main] Cleanup warning:', err.message);
        }
      }
    );
  }
}

// ── app lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    // Wait for any stale server processes to fully die before binding port 5000.
    // 2s is enough for Windows to release the port after taskkill.
    setTimeout(() => {
      startPythonServer();
      createWindow();
      createTray();
    }, 2000);
  } else {
    startPythonServer();
    createWindow();
    createTray();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', killPythonServer);
app.on('will-quit',   killPythonServer);