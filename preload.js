// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    runInitialization: () => ipcRenderer.invoke('run-initialization'),
    onInitProgress: (callback) => ipcRenderer.on('init-progress', (_event, value) => callback(value)),
    initializationComplete: (result) => ipcRenderer.send('initialization-complete', result),
    onInitialData: (callback) => ipcRenderer.on('initial-data', (_event, value) => callback(value)),

    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    relaunchApp: () => ipcRenderer.send('relaunch-app'),
    
    openAcknowledgementsWindow: (theme) => ipcRenderer.send('open-acknowledgements-window', theme),
    closeCurrentWindow: () => ipcRenderer.send('close-current-window'),
    
    openSecretWindow: (theme) => ipcRenderer.send('open-secret-window', theme),
    openToolWindow: (viewName, toolId, theme) => ipcRenderer.send('open-tool-window', viewName, toolId, theme),
    // 新增：彩蛋窗口控制
    secretWindowMinimize: () => ipcRenderer.send('secret-window-minimize'),
    secretWindowMaximize: () => ipcRenderer.send('secret-window-maximize'),

    logAction: (logData) => ipcRenderer.invoke('log-action', logData),
    getLogs: (filterDate) => ipcRenderer.invoke('get-logs', filterDate),
    clearLogs: () => ipcRenderer.invoke('clear-logs'),
    getTrafficStats: () => ipcRenderer.invoke('get-traffic-stats'),
    addTraffic: (bytes) => ipcRenderer.invoke('add-traffic', bytes),
    reportTraffic: (bytes) => ipcRenderer.send('report-traffic', bytes),

    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    checkUpdates: () => ipcRenderer.invoke('check-updates'),
    downloadUpdate: (url) => ipcRenderer.invoke('download-update', url),
    cancelDownload: () => ipcRenderer.invoke('cancel-download'),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
    onNetworkSpeedUpdate: (callback) => ipcRenderer.on('network-speed-update', (_event, value) => callback(value)),
    openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
    showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

    saveMedia: (data) => ipcRenderer.invoke('save-media', data),

    setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
    setGlobalVolume: (volume) => ipcRenderer.invoke('set-global-volume'),
    selectBackgroundImage: () => ipcRenderer.invoke('select-background-image'),
    clearBackgroundImage: () => ipcRenderer.invoke('clear-background-image'),
    setBackgroundOpacity: (opacity) => ipcRenderer.invoke('set-background-opacity'),
    setCardOpacity: (opacity) => ipcRenderer.invoke('set-card-opacity'),
    
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    getMemoryUpdate: () => ipcRenderer.invoke('get-memory-update'),
    getRealtimeStats: () => ipcRenderer.invoke('get-realtime-stats'),
    getGpuStats: () => ipcRenderer.invoke('get-gpu-stats'),
    getTrafficHistory: () => ipcRenderer.invoke('get-traffic-history'),

    launchSystemTool: (command) => ipcRenderer.send('launch-system-tool', command),
    showConfirmationDialog: (options) => ipcRenderer.invoke('show-confirmation-dialog', options),
    checkSecretAccess: () => ipcRenderer.invoke('check-secret-access'),
    recordSecretFailure: () => ipcRenderer.invoke('record-secret-failure'),
    resetSecretAttempts: () => ipcRenderer.invoke('reset-secret-attempts'),
    checkAndRelaunchAsAdmin: () => ipcRenderer.invoke('check-and-relaunch-as-admin'),
    // 新增：请求主进程打开一个新窗口 (用于 webview 弹窗)
    requestNewWindow: (url, options) => ipcRenderer.send('request-new-window', url, options),
});