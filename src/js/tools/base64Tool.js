// src/js/tools/base64Tool.js
import BaseTool from '../baseTool.js';

class Base64Tool extends BaseTool {
    constructor() {
        super('base64-converter', 'Base64 转换');
        this.dom = {};
        this.currentImageType = null; // 用于保存解码出的图片类型
    }

    render() {
        // [删除] 已移除 .section-header.tool-window-header
        return `
            <div class="page-container base64-tool-container" style="display: flex; flex-direction: column; height: 100%;">
                
                <div class="content-area" style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;">
                    
                    <div class="base64-main-area settings-section">
                        <h2><i class="fas fa-edit"></i> 文本 / Base64 输入/输出</h2>
                        <div class="base64-textarea-wrapper">
                            <textarea id="b64-main-textarea" placeholder="在此输入文本或粘贴 Base64 字符串..."></textarea>
                            <div class="textarea-actions">
                                <button id="b64-paste-btn" class="control-btn mini-btn ripple" title="粘贴"><i class="fas fa-paste"></i></button>
                                <button id="b64-copy-btn" class="control-btn mini-btn ripple" title="复制"><i class="fas fa-copy"></i></button>
                                <button id="b64-clear-btn" class="control-btn mini-btn ripple error-btn" title="清空"><i class="fas fa-times"></i></button>
                            </div>
                        </div>
                        <div class="base64-actions">
                            <button id="b64-encode-btn" class="action-btn ripple"><i class="fas fa-arrow-down"></i> 编码为 Base64</button>
                            <button id="b64-decode-btn" class="action-btn ripple"><i class="fas fa-arrow-up"></i> 从 Base64 解码</button>
                        </div>
                    </div>

                    <div class="base64-image-area settings-section">
                        <h2><i class="fas fa-image"></i> 图片处理</h2>
                        <div class="image-controls">
                            <label class="action-btn ripple" for="b64-image-input" style="cursor: pointer;">
                                <i class="fas fa-upload"></i> 选择图片转 Base64
                            </label>
                            <input type="file" id="b64-image-input" accept="image/png, image/jpeg, image/webp, image/gif" style="display: none;">
                        </div>
                        <div id="b64-image-preview-area" class="image-preview-area" style="display: none;">
                            <h3>解码预览:</h3>
                            <div id="b64-image-output" class="image-output"></div>
                            <button id="b64-download-image-btn" class="control-btn ripple"><i class="fas fa-download"></i> 下载图片</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this._log('工具已初始化');

        // 绑定返回按钮
        // const backBtn = document.getElementById('back-to-toolbox-btn');
        // if (backBtn) {
        //     backBtn.addEventListener('click', () => {
        //         window.electronAPI.closeCurrentWindow();
        //     });
        // }

        // 缓存 DOM 元素
        this.dom.mainTextarea = document.getElementById('b64-main-textarea');
        this.dom.pasteBtn = document.getElementById('b64-paste-btn');
        this.dom.copyBtn = document.getElementById('b64-copy-btn');
        this.dom.clearBtn = document.getElementById('b64-clear-btn');
        this.dom.encodeBtn = document.getElementById('b64-encode-btn');
        this.dom.decodeBtn = document.getElementById('b64-decode-btn');
        this.dom.imageInput = document.getElementById('b64-image-input');
        this.dom.imagePreviewArea = document.getElementById('b64-image-preview-area');
        this.dom.imageOutput = document.getElementById('b64-image-output');
        this.dom.downloadImageBtn = document.getElementById('b64-download-image-btn');

        // 绑定事件
        this.dom.pasteBtn.addEventListener('click', this._handlePaste.bind(this));
        this.dom.copyBtn.addEventListener('click', this._handleCopy.bind(this));
        this.dom.clearBtn.addEventListener('click', this._handleClear.bind(this));
        this.dom.encodeBtn.addEventListener('click', this._handleTextEncode.bind(this));
        this.dom.decodeBtn.addEventListener('click', this._handleBase64Decode.bind(this));
        this.dom.imageInput.addEventListener('change', this._handleImageUpload.bind(this));
        this.dom.downloadImageBtn.addEventListener('click', this._handleDownloadImage.bind(this));
    }

    async _handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            this.dom.mainTextarea.value = text;
            this._log('内容已粘贴');
        } catch (err) {
            this._notify('错误', '无法读取剪贴板内容', 'error');
            this._log('粘贴失败: ' + err.message);
        }
    }

    _handleCopy() {
        const text = this.dom.mainTextarea.value;
        if (!text) {
            this._notify('提示', '没有内容可复制', 'info');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            this._notify('成功', '已复制到剪贴板', 'success');
            this._log('内容已复制');
        }).catch(err => {
            this._notify('错误', '复制失败', 'error');
            this._log('复制失败: ' + err.message);
        });
    }

    _handleClear() {
        this.dom.mainTextarea.value = '';
        this.dom.imageInput.value = ''; // 清空文件选择
        this.dom.imagePreviewArea.style.display = 'none';
        this.dom.imageOutput.innerHTML = '';
        this.currentImageType = null;
        this._log('输入/输出区域已清空');
    }

    _handleTextEncode() {
        const text = this.dom.mainTextarea.value;
        if (!text) {
            this._notify('提示', '输入文本不能为空', 'info');
            return;
        }
        try {
            const encoded = btoa(unescape(encodeURIComponent(text)));
            this.dom.mainTextarea.value = encoded;
            this._log('文本编码为 Base64 成功');
            // 清除可能存在的图片预览
            this.dom.imagePreviewArea.style.display = 'none';
            this.dom.imageOutput.innerHTML = '';
            this.currentImageType = null;
        } catch (e) {
            this._notify('错误', '文本编码失败: ' + e.message, 'error');
            this._log('文本编码失败: ' + e.message);
        }
    }

    _handleBase64Decode() {
        const data = this.dom.mainTextarea.value.trim();
        if (!data) {
            this._notify('提示', '输入 Base64 不能为空', 'info');
            return;
        }

        // 清空上次结果
        this.dom.mainTextarea.value = '';
        this.dom.imagePreviewArea.style.display = 'none';
        this.dom.imageOutput.innerHTML = '';
        this.currentImageType = null;

        if (data.startsWith('data:image/')) {
            // 识别为图片 Data URL
            try {
                const img = new Image();
                img.style.maxWidth = '100%';
                img.style.maxHeight = '300px'; // 限制预览高度
                img.style.objectFit = 'contain';
                img.src = data;
                img.onload = () => {
                    this.dom.imageOutput.appendChild(img);
                    this.dom.imagePreviewArea.style.display = 'block';
                    // 从 Data URL 中提取图片类型
                    const match = data.match(/^data:image\/(.+);base64,/);
                    this.currentImageType = match ? match[1] : 'png'; // 默认为 png
                    this._log('Base64 解码为图片成功');
                };
                img.onerror = () => {
                    throw new Error('Base64 数据无效或图片已损坏');
                };
            } catch (e) {
                this.dom.mainTextarea.value = `图片解码失败: ${e.message}`; // 将错误信息显示在文本区
                this._notify('错误', '图片解码失败', 'error');
                this._log('Base64 解码为图片失败: ' + e.message);
            }
        } else {
            // 尝试解码为文本
            try {
                const decoded = decodeURIComponent(escape(atob(data)));
                this.dom.mainTextarea.value = decoded; // 将解码结果放回文本区
                this._log('Base64 解码为文本成功');
            } catch (e) {
                this.dom.mainTextarea.value = `解码失败: ${e.message}`; // 将错误信息显示在文本区
                this._notify('错误', '解码失败，不是有效的图片或文本 Base64', 'error');
                this._log('Base64 解码失败: ' + e.message);
            }
        }
    }

    _handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.dom.mainTextarea.value = e.target.result; // 将图片 Base64 输出到主文本区
            this._log(`图片 [${file.name}] 编码为 Base64 成功`);
            this._notify('成功', `图片 ${file.name} 已转换为 Base64`, 'success');
            // 清除可能存在的图片预览
            this.dom.imagePreviewArea.style.display = 'none';
            this.dom.imageOutput.innerHTML = '';
            this.currentImageType = null;
        };
        reader.onerror = (e) => {
            this._notify('错误', '读取图片文件失败: ' + e.message, 'error');
            this._log('读取图片文件失败: ' + e.message);
        };
        reader.readAsDataURL(file);
    }

    _handleDownloadImage() {
        const imgElement = this.dom.imageOutput.querySelector('img');
        if (!imgElement || !imgElement.src.startsWith('data:image/')) {
            this._notify('提示', '没有可下载的解码图片', 'info');
            return;
        }

        const base64Data = imgElement.src.split(',')[1];
        if (!base64Data) {
            this._notify('错误', '无法提取图片数据', 'error');
            return;
        }

        try {
            // 将 Base64 转换为 Blob
            const byteString = atob(base64Data);
            const mimeString = imgElement.src.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeString });

            // 使用 Electron API 保存 Blob
            blob.arrayBuffer().then(buffer => {
                const extension = this.currentImageType || 'png';
                const defaultPath = `decoded_image_${Date.now()}.${extension}`;
                window.electronAPI.saveMedia({ buffer: buffer, defaultPath }).then(result => {
                    if (result.success) {
                        this._notify('下载成功', '图片已保存');
                        this._log('解码后的图片已下载');
                    } else if (result.error !== '用户取消保存') {
                        this._notify('下载失败', result.error, 'error');
                         this._log('图片下载失败: ' + result.error);
                    }
                });
            });
        } catch (e) {
            this._notify('错误', '准备下载时出错: ' + e.message, 'error');
            this._log('图片下载准备失败: ' + e.message);
        }
    }

    destroy() {
        this._log('工具已销毁');
        // 如果添加了其他需要清理的资源，在这里处理
        super.destroy();
    }
}

export default Base64Tool;