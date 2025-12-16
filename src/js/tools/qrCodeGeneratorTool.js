// src/js/tools/qrCodeGeneratorTool.js
import BaseTool from '../baseTool.js';

class QRCodeGeneratorTool extends BaseTool {
    constructor() {
        super('qr-code-generator', '二维码生成');
        this.dom = {};
        this.qrcodeInstance = null;
        this.currentOptions = {
            text: '',
            width: 256,
            height: 256,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H // High correction level by default
        };
    }

    render() {
        return `
            <div class="page-container qr-code-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回工具箱</button>
                    <h1 style="flex-grow: 1; text-align: center;">${this.name}</h1>
                    <div style="width: 70px;"></div> </div>

                <div class="content-area" style="padding: 20px; flex-grow: 1; display: flex; gap: 20px; overflow-y: auto;">

                    <div class="qr-options-panel settings-section">
                        <h2><i class="fas fa-cog"></i> 内容与选项</h2>

                        <div class="setting-item">
                            <label for="qr-text-input" class="setting-item-title">输入内容:</label>
                            <textarea id="qr-text-input" placeholder="输入文本、网址或其他内容..." style="height: 100px; resize: vertical;"></textarea>
                        </div>

                        <div class="setting-item">
                            <label for="qr-size-slider" class="setting-item-title">二维码尺寸:</label>
                            <div class="opacity-control">
                                <input type="range" id="qr-size-slider" min="128" max="1024" step="32" value="${this.currentOptions.width}">
                                <span id="qr-size-value">${this.currentOptions.width} px</span>
                            </div>
                        </div>

                        <div class="setting-item">
                             <label for="qr-color-dark" class="setting-item-title">深色 (点):</label>
                             <input type="color" id="qr-color-dark" value="${this.currentOptions.colorDark}">
                        </div>
                        <div class="setting-item">
                            <label for="qr-color-light" class="setting-item-title">浅色 (背景):</label>
                            <input type="color" id="qr-color-light" value="${this.currentOptions.colorLight}">
                        </div>


                        <div class="setting-item">
                            <label for="qr-correct-level" class="setting-item-title">纠错级别:</label>
                            <select id="qr-correct-level">
                                <option value="L">低 (L ~7%)</option>
                                <option value="M">中 (M ~15%)</option>
                                <option value="Q">较高 (Q ~25%)</option>
                                <option value="H" selected>高 (H ~30%)</option>
                            </select>
                            <p class="setting-item-description" style="font-size: 12px; margin-top: 5px;">级别越高，允许被遮挡的面积越大，但承载信息量越小。</p>
                        </div>
                    </div>

                    <div class="qr-preview-panel settings-section">
                        <h2><i class="fas fa-qrcode"></i> 预览与保存</h2>
                        <div id="qr-code-output" class="qr-code-output">
                            <p class="qr-placeholder">请在左侧输入内容</p>
                        </div>
                        <button id="qr-save-btn" class="action-btn ripple" disabled><i class="fas fa-save"></i> 保存二维码</button>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('工具已初始化');

        // Check if QRCode library is available
        if (typeof QRCode === 'undefined') {
            this._showErrorState('错误：QRCode 库未加载。请检查网络连接或 HTML 文件。');
            this._log('QRCode 库未找到', 'error');
            return;
        }


        const backBtn = document.getElementById('back-to-toolbox-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                 window.mainPage.navigateTo('toolbox');
                 window.mainPage.updateActiveNavButton(document.getElementById('toolbox-btn'));
            });
        }

        // Cache DOM
        this.dom.textInput = document.getElementById('qr-text-input');
        this.dom.sizeSlider = document.getElementById('qr-size-slider');
        this.dom.sizeValue = document.getElementById('qr-size-value');
        this.dom.colorDark = document.getElementById('qr-color-dark');
        this.dom.colorLight = document.getElementById('qr-color-light');
        this.dom.correctLevelSelect = document.getElementById('qr-correct-level');
        this.dom.outputDiv = document.getElementById('qr-code-output');
        this.dom.saveBtn = document.getElementById('qr-save-btn');

        // Bind events
        // Use 'input' for sliders and text area for real-time update
        this.dom.textInput.addEventListener('input', this._debounce(this._updateQRCode.bind(this), 300));
        this.dom.sizeSlider.addEventListener('input', this._handleSizeChange.bind(this));
        this.dom.colorDark.addEventListener('input', this._debounce(this._handleColorChange.bind(this), 100));
        this.dom.colorLight.addEventListener('input', this._debounce(this._handleColorChange.bind(this), 100));
        this.dom.correctLevelSelect.addEventListener('change', this._handleCorrectLevelChange.bind(this));
        this.dom.saveBtn.addEventListener('click', this._handleSave.bind(this));

        // Initial generation if needed (or wait for user input)
        // this._updateQRCode(); // Optionally generate placeholder QR on init
    }

    _showErrorState(message) {
        const contentArea = document.querySelector('.qr-code-container .content-area');
        if (contentArea) {
            contentArea.innerHTML = `<div class="loading-container"><p class="error-message">${message}</p></div>`;
        }
    }

    _handleSizeChange() {
        const size = parseInt(this.dom.sizeSlider.value, 10);
        this.currentOptions.width = size;
        this.currentOptions.height = size;
        this.dom.sizeValue.textContent = `${size} px`;
        this._updateQRCode(); // Regenerate QR code with new size
    }

     _handleColorChange() {
        this.currentOptions.colorDark = this.dom.colorDark.value;
        this.currentOptions.colorLight = this.dom.colorLight.value;
        this._updateQRCode();
    }


    _handleCorrectLevelChange() {
        const levelMap = { 'L': QRCode.CorrectLevel.L, 'M': QRCode.CorrectLevel.M, 'Q': QRCode.CorrectLevel.Q, 'H': QRCode.CorrectLevel.H };
        this.currentOptions.correctLevel = levelMap[this.dom.correctLevelSelect.value] || QRCode.CorrectLevel.H;
        this._updateQRCode();
    }

    _updateQRCode() {
        this.currentOptions.text = this.dom.textInput.value;

        // Clear previous QR code
        this.dom.outputDiv.innerHTML = '';
        this.qrcodeInstance = null; // Reset instance

        if (!this.currentOptions.text) {
            this.dom.outputDiv.innerHTML = '<p class="qr-placeholder">请在左侧输入内容</p>';
            this.dom.saveBtn.disabled = true;
            return;
        }

        try {
            // Use qrcodejs to generate QR code directly into the div
            this.qrcodeInstance = new QRCode(this.dom.outputDiv, {
                text: this.currentOptions.text,
                width: this.currentOptions.width,
                height: this.currentOptions.height,
                colorDark : this.currentOptions.colorDark,
                colorLight : this.currentOptions.colorLight,
                correctLevel : this.currentOptions.correctLevel
            });
            this.dom.saveBtn.disabled = false;
            this._log('QR code generated successfully');
        } catch (error) {
            this.dom.outputDiv.innerHTML = `<p class="error-message">生成失败: ${error.message}</p>`;
            this.dom.saveBtn.disabled = true;
            this._log(`QR code generation failed: ${error.message}`, 'error');
        }
    }

    _handleSave() {
        if (!this.qrcodeInstance || !this.currentOptions.text) {
            this._notify('无法保存', '请先生成二维码', 'error');
            return;
        }

        try {
            // Get the canvas element created by qrcodejs
            const canvas = this.dom.outputDiv.querySelector('canvas');
            if (!canvas) {
                 // Fallback if canvas not found (might happen if qrcodejs used img)
                 const img = this.dom.outputDiv.querySelector('img');
                 if (img && img.src.startsWith('data:image/png;base64,')) {
                     this._saveDataURL(img.src);
                 } else {
                    throw new Error('无法找到生成的二维码图像');
                 }
                 return;
            }

            // Convert canvas to Data URL
            const dataUrl = canvas.toDataURL('image/png');
            this._saveDataURL(dataUrl);

        } catch (error) {
            this._notify('保存失败', error.message, 'error');
            this._log(`Failed to save QR code: ${error.message}`, 'error');
        }
    }

    _saveDataURL(dataUrl) {
         // Extract base64 data
         const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
         // Convert base64 to ArrayBuffer
         const byteString = atob(base64Data);
         const ab = new ArrayBuffer(byteString.length);
         const ia = new Uint8Array(ab);
         for (let i = 0; i < byteString.length; i++) {
             ia[i] = byteString.charCodeAt(i);
         }

         const defaultPath = `qrcode_${Date.now()}.png`;
         window.electronAPI.saveMedia({ buffer: ab, defaultPath }).then(result => {
             if (result.success) {
                 this._notify('保存成功', '二维码图片已保存');
                 this._log('QR code image saved');
             } else if (result.error !== '用户取消保存') {
                 this._notify('保存失败', result.error, 'error');
                 this._log('QR code save failed: ' + result.error, 'error');
             }
         });
    }

    _debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    destroy() {
        this._log('工具已销毁');
        // Clear QR code instance if needed, remove listeners if manually added beyond init
        this.qrcodeInstance = null;
        if (this.dom.outputDiv) this.dom.outputDiv.innerHTML = '';
        super.destroy();
    }
}

export default QRCodeGeneratorTool;