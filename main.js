// main.js
import { app, BrowserWindow } from 'electron'
import path from 'path'
import { spawn } from 'child_process'
// import { fork } from 'child_process'
import { fileURLToPath } from 'url'
import isDev from 'electron-is-dev'
import log from 'electron-log'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow
let serverProcess

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Load the React frontend
  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:3006')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile('client/build/index.html')
    // Optionally open DevTools in production for debugging (remove/comment out in production)
    // mainWindow.webContents.openDevTools();
  }
}

function startServer() {
  const serverPath = isDev
    ? path.join(__dirname, 'server', 'index.js') // Development path
    : path.join(process.resourcesPath, 'server', 'index.js') // Production path

  log.info(`Starting server from path: ${serverPath}`)

  serverProcess = spawn('node', [serverPath], {
    cwd: isDev
      ? path.join(__dirname, 'server')
      : path.join(process.resourcesPath, 'server'),
    env: process.env,
    shell: true,
  })

  // Log server stdout
  serverProcess.stdout.on('data', (data) => {
    log.info(`Server stdout: ${data}`)
  })

  // Log server stderr
  serverProcess.stderr.on('data', (data) => {
    log.error(`Server stderr: ${data}`)
  })

  // Handle server errors
  serverProcess.on('error', (err) => {
    log.error('Failed to start server process:', err)
  })

  // Handle server exit
  serverProcess.on('exit', (code, signal) => {
    if (isDev) {
      log.info(`Server process exited with code ${code} and signal ${signal}`)
    } else {
      log.error(`Server process exited with code ${code} and signal ${signal}`)
      // Optionally, restart the server after a delay
      setTimeout(() => {
        log.info('Attempting to restart the server...')
        startServer()
      }, 5000) // 5-second delay
    }
  })
}

app.whenReady().then(() => {
  createWindow()

  if (!isDev) {
    // Only start server in production
    startServer()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill()
  }
})
