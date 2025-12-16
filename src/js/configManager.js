// src/js/configManager.js

class ConfigManager {
    constructor() {
        this.config = null;
        this.globalVolume = 0.4; 
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

        // 1. 应用主题
        document.body.setAttribute('data-theme', settings.theme || 'dark');
        
        // 2. 应用自定义背景
        const bgLayer = document.getElementById('background-layer');
        const hasBgImage = settings.backgroundImage && settings.backgroundImage.length > 0;

        if (bgLayer) {
            bgLayer.style.backgroundImage = hasBgImage ? `url(${settings.backgroundImage})` : 'none';
        }

        // 3. 应用透明度
        const bgOpacity = settings.backgroundOpacity || 1.0;
        const cardOpacity = settings.cardOpacity || 0.7;
        
        root.style.setProperty('--background-opacity', bgOpacity);
        root.style.setProperty('--card-opacity', cardOpacity);
        
        const navOpacity = 1 - (1 - bgOpacity) / 2;
        root.style.setProperty('--navbar-opacity', navOpacity);

        // -------------------------------------------------------
        // 4. [修复] 全局字体应用逻辑 (排除图标字体)
        // -------------------------------------------------------
        
        const oldStyle = document.getElementById('custom-font-style');
        if (oldStyle) oldStyle.remove();

        if (window.location.href.includes('view-browser.html')) {
            root.style.removeProperty('--font-family');
            return;
        }

        if (settings.customFontName && settings.customFontPath) {
            const styleTag = document.createElement('style');
            styleTag.id = 'custom-font-style';
            const cacheBuster = Date.now();
            
            // [关键修改]
            // 1. 定义自定义字体
            // 2. 全局应用自定义字体
            // 3. [核心] 显式排除 FontAwesome 图标类，强制它们使用图标字体
            styleTag.textContent = `
                @font-face {
                    font-family: 'UserCustomFont';
                    src: url('${settings.customFontPath}?v=${cacheBuster}');
                    font-display: swap;
                }
                
                :root {
                    --font-family: 'UserCustomFont', -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif !important;
                }
                
                /* 应用于所有普通元素 */
                *:not(.fa):not(.fas):not(.far):not(.fab):not(i) {
                    font-family: 'UserCustomFont', -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif !important;
                }
                
                /* [核心修复] 强制图标使用 FontAwesome 字体，防止被全局字体覆盖成方块 */
                .fa, .fas {
                    font-family: "Font Awesome 6 Free" !important;
                    font-weight: 900 !important;
                }
                .far {
                    font-family: "Font Awesome 6 Free" !important;
                    font-weight: 400 !important;
                }
                .fab {
                    font-family: "Font Awesome 6 Brands" !important;
                    font-weight: 400 !important;
                }
            `;
            document.head.appendChild(styleTag);
        } else {
            root.style.removeProperty('--font-family');
        }
    }
    
    setVolume(newVolume) {
        const cleanNewVolume = Math.max(0, Math.min(1, newVolume));
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