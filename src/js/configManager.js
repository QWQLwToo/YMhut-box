class ConfigManager {
    constructor() {
        this.config = null;
        this.globalVolume = 0.5; // 默认音量
    }

    setConfig(config) {
        this.config = config;
        if (config.dbSettings) {
            if (typeof config.dbSettings.globalVolume === 'number') {
                this.globalVolume = config.dbSettings.globalVolume;
            }
            this.applyAppSettings(config.dbSettings);
        }
    }

    applyAppSettings(settings) {
        const root = document.documentElement;

        // 应用主题
        document.body.setAttribute('data-theme', settings.theme || 'dark');
        
        // 应用自定义背景
        const bgLayer = document.getElementById('background-layer');
        const hasBgImage = settings.backgroundImage && settings.backgroundImage.length > 0;

        if (bgLayer) {
            bgLayer.style.backgroundImage = hasBgImage ? `url(${settings.backgroundImage})` : 'none';
        }

        const bgOpacity = settings.backgroundOpacity || 1.0;
        const cardOpacity = settings.cardOpacity || 0.7;
        
        // 将透明度设置应用到 CSS 变量
        root.style.setProperty('--background-opacity', bgOpacity);
        root.style.setProperty('--card-opacity', cardOpacity);
        
        // 计算导航栏的减半效果透明度
        // 公式: 1 - (1 - bgOpacity) / 2  => 使得背景越透明，导航栏受影响越小
        const navOpacity = 1 - (1 - bgOpacity) / 2;
        root.style.setProperty('--navbar-opacity', navOpacity);
    }
    
    setVolume(newVolume) {
        const cleanNewVolume = Math.max(0, Math.min(1, newVolume)); // 保证音量在 0-1 之间
        if (this.globalVolume !== cleanNewVolume) {
            const oldVolumePercent = Math.round(this.globalVolume * 100);
            const newVolumePercent = Math.round(cleanNewVolume * 100);
            this.logAction(`全局音量从 ${oldVolumePercent}% 调整为 ${newVolumePercent}%`, 'settings');
            this.globalVolume = cleanNewVolume;
            window.electronAPI.setGlobalVolume(cleanNewVolume);
        }
    }

    logAction(action, category = 'general') {
        const timestamp = new Date().toISOString();
        try {
            window.electronAPI.logAction({ timestamp, action, category });
        } catch (error) {
            console.error('日志记录失败:', error);
        }
    }

    formatBytes(bytes, decimals = 2) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

export default new ConfigManager();