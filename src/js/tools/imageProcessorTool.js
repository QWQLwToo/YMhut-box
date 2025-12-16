// src/js/tools/imageProcessorTool.js
import BaseTool from '../baseTool.js';

class ImageProcessorTool extends BaseTool {
    constructor() {
        super('image-processor', '图片处理工坊');
        this.cropper = null;
        this.filename = 'image';
        // 默认参数
        this.params = {
            scaleX: 1,
            scaleY: 1,
            rotate: 0,
            brightness: 100,
            contrast: 100
        };
    }

    render() {
        // 动态注入样式（如果尚未存在）
        const cssId = 'cropper-css';
        if (!document.getElementById(cssId)) {
            const link = document.createElement('link');
            link.id = cssId;
            link.rel = 'stylesheet';
            link.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css';
            document.head.appendChild(link);
        }

        // [优化 1] 移除 header 中的返回按钮，调整布局适应子窗口
        return `
            <div class="page-container image-tool-container" style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
                
                <div class="tool-window-header" style="padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); background-color: rgba(var(--card-background-rgb), 0.5);">
                    <h2 style="margin: 0; font-size: 16px;"><i class="fas fa-magic"></i> ${this.name}</h2>
                    <div style="display: flex; gap: 10px;">
                        <button id="btn-upload" class="control-btn mini-btn ripple"><i class="fas fa-folder-open"></i> 打开图片</button>
                        <button id="img-save-btn" class="action-btn mini-btn ripple" disabled><i class="fas fa-save"></i> 保存</button>
                    </div>
                </div>

                <div class="content-area" style="padding: 0; flex-grow: 1; display: flex; overflow: hidden;">
                    
                    <div class="img-canvas-wrapper" style="flex: 1; background-color: #1e1e1e; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        <div id="img-placeholder" style="text-align: center; color: #666; cursor: pointer;">
                            <i class="fas fa-image" style="font-size: 48px; margin-bottom: 10px;"></i>
                            <p>拖拽图片至此 或 点击打开</p>
                        </div>
                        <div style="max-width: 90%; max-height: 90%; display: none;" id="cropper-img-container">
                            <img id="img-editor-target" style="display: block; max-width: 100%;">
                        </div>
                        <input type="file" id="img-upload-input" accept="image/*" style="display:none;">
                    </div>

                    <div class="img-controls-panel" style="width: 280px; background-color: var(--card-background); border-left: 1px solid var(--border-color); display: flex; flex-direction: column; padding: 15px; overflow-y: auto; gap: 20px;">
                        
                        <div class="control-group">
                            <div class="group-title">裁剪比例</div>
                            <div class="tool-grid-small">
                                <button class="control-btn mini-btn ripple" data-ratio="NaN">自由</button>
                                <button class="control-btn mini-btn ripple" data-ratio="1">1:1</button>
                                <button class="control-btn mini-btn ripple" data-ratio="1.7778">16:9</button>
                                <button class="control-btn mini-btn ripple" data-ratio="1.3333">4:3</button>
                            </div>
                        </div>

                        <div class="control-group">
                            <div class="group-title">旋转与翻转</div>
                            <div class="tool-grid-small">
                                <button class="control-btn mini-btn ripple" id="btn-rotate-left" title="向左旋转"><i class="fas fa-undo"></i></button>
                                <button class="control-btn mini-btn ripple" id="btn-rotate-right" title="向右旋转"><i class="fas fa-redo"></i></button>
                                <button class="control-btn mini-btn ripple" id="btn-flip-h" title="水平翻转"><i class="fas fa-arrows-alt-h"></i></button>
                                <button class="control-btn mini-btn ripple" id="btn-flip-v" title="垂直翻转"><i class="fas fa-arrows-alt-v"></i></button>
                            </div>
                        </div>

                        <div class="control-group">
                            <div class="group-title">色彩调整 (保存生效)</div>
                            <div class="setting-item">
                                <div class="label-row"><span>亮度</span><span id="val-brightness">100%</span></div>
                                <input type="range" id="filter-brightness" min="0" max="200" value="100">
                            </div>
                            <div class="setting-item">
                                <div class="label-row"><span>对比度</span><span id="val-contrast">100%</span></div>
                                <input type="range" id="filter-contrast" min="0" max="200" value="100">
                            </div>
                            <button class="control-btn mini-btn ripple" id="btn-reset-filters" style="width: 100%; margin-top: 5px;">重置参数</button>
                        </div>

                        <div class="control-group">
                            <div class="group-title">导出设置</div>
                            <div class="setting-item">
                                <span>格式</span>
                                <select id="img-format" class="settings-input-text" style="width: 100%;">
                                    <option value="image/jpeg">JPG (推荐)</option>
                                    <option value="image/png">PNG (无损)</option>
                                    <option value="image/webp">WEBP</option>
                                </select>
                            </div>
                            <div class="setting-item">
                                <div class="label-row"><span>质量</span><span id="val-quality">90%</span></div>
                                <input type="range" id="img-quality" min="10" max="100" value="90">
                            </div>
                        </div>

                    </div>
                </div>
            </div>
            <style>
                .group-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; }
                .tool-grid-small { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
                .setting-item { margin-bottom: 10px; }
                .label-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
                input[type=range] { width: 100%; }
            </style>
        `;
    }

    init() {
        this._log('图片处理工坊初始化...');
        this.dom = {
            uploadInput: document.getElementById('img-upload-input'),
            uploadPlaceholder: document.getElementById('img-placeholder'),
            imgContainer: document.getElementById('cropper-img-container'),
            image: document.getElementById('img-editor-target'),
            saveBtn: document.getElementById('img-save-btn'),
            
            brightness: document.getElementById('filter-brightness'),
            contrast: document.getElementById('filter-contrast'),
            valBrightness: document.getElementById('val-brightness'),
            valContrast: document.getElementById('val-contrast'),
            
            format: document.getElementById('img-format'),
            quality: document.getElementById('img-quality'),
            valQuality: document.getElementById('val-quality')
        };

        // 绑定上传事件
        document.getElementById('btn-upload').addEventListener('click', () => this.dom.uploadInput.click());
        this.dom.uploadPlaceholder.addEventListener('click', () => this.dom.uploadInput.click());
        this.dom.uploadInput.addEventListener('change', (e) => this._handleFile(e.target.files[0]));

        // 拖拽支持
        const wrapper = document.querySelector('.img-canvas-wrapper');
        wrapper.addEventListener('dragover', (e) => e.preventDefault());
        wrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            if(e.dataTransfer.files.length) this._handleFile(e.dataTransfer.files[0]);
        });

        // 绑定控制按钮
        this._bindControls();
    }

    _handleFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            return this._notify('错误', '请选择有效的图片文件', 'error');
        }
        this.filename = file.name.replace(/\.[^/.]+$/, ""); // 去除后缀

        const reader = new FileReader();
        reader.onload = (e) => {
            this.dom.image.src = e.target.result;
            this._initCropper();
        };
        reader.readAsDataURL(file);
    }

    _initCropper() {
        // 销毁旧实例
        if (this.cropper) {
            this.cropper.destroy();
        }

        this.dom.uploadPlaceholder.style.display = 'none';
        this.dom.imgContainer.style.display = 'block';
        this.dom.saveBtn.disabled = false;

        // 重置参数
        this.params = { scaleX: 1, scaleY: 1, rotate: 0, brightness: 100, contrast: 100 };
        this._updateFilterUI();

        this.cropper = new Cropper(this.dom.image, {
            viewMode: 1, // 限制裁剪框在画布内
            dragMode: 'move',
            autoCropArea: 0.9,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
            ready: () => {
                this._log('Cropper 就绪');
            }
        });
    }

    _bindControls() {
        // 比例按钮
        document.querySelectorAll('button[data-ratio]').forEach(btn => {
            btn.addEventListener('click', () => {
                if(!this.cropper) return;
                const ratio = parseFloat(btn.dataset.ratio);
                this.cropper.setAspectRatio(ratio);
            });
        });

        // 旋转翻转
        const wrap = (fn) => () => { if(this.cropper) fn(); };
        document.getElementById('btn-rotate-left').addEventListener('click', wrap(() => this.cropper.rotate(-90)));
        document.getElementById('btn-rotate-right').addEventListener('click', wrap(() => this.cropper.rotate(90)));
        document.getElementById('btn-flip-h').addEventListener('click', wrap(() => {
            this.params.scaleX = -this.params.scaleX;
            this.cropper.scaleX(this.params.scaleX);
        }));
        document.getElementById('btn-flip-v').addEventListener('click', wrap(() => {
            this.params.scaleY = -this.params.scaleY;
            this.cropper.scaleY(this.params.scaleY);
        }));

        // 滤镜滑块实时预览 (CSS 预览，不影响 crop 数据，保存时才真正应用)
        const updateFilterPreview = () => {
            this.params.brightness = this.dom.brightness.value;
            this.params.contrast = this.dom.contrast.value;
            this._updateFilterUI();
            
            // 将 CSS 滤镜应用到 Cropper 的 canvas 容器上以实现预览
            const cropperCanvas = document.querySelector('.cropper-canvas');
            if (cropperCanvas) {
                cropperCanvas.style.filter = `brightness(${this.params.brightness}%) contrast(${this.params.contrast}%)`;
            }
        };
        this.dom.brightness.addEventListener('input', updateFilterPreview);
        this.dom.contrast.addEventListener('input', updateFilterPreview);

        document.getElementById('btn-reset-filters').addEventListener('click', () => {
            this.params.brightness = 100;
            this.params.contrast = 100;
            this._updateFilterUI();
            updateFilterPreview();
        });

        // 质量滑块
        this.dom.quality.addEventListener('input', (e) => {
            this.dom.valQuality.textContent = e.target.value + '%';
        });

        // 保存
        this.dom.saveBtn.addEventListener('click', () => this._save());
    }

    _updateFilterUI() {
        this.dom.brightness.value = this.params.brightness;
        this.dom.contrast.value = this.params.contrast;
        this.dom.valBrightness.textContent = this.params.brightness + '%';
        this.dom.valContrast.textContent = this.params.contrast + '%';
    }

    async _save() {
        if (!this.cropper) return;
        
        this.dom.saveBtn.disabled = true;
        this.dom.saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';

        try {
            // 1. 获取裁剪后的基础 Canvas
            const sourceCanvas = this.cropper.getCroppedCanvas({
                imageSmoothingQuality: 'high'
            });

            if (!sourceCanvas) throw new Error('无法生成图片数据');

            // 2. 创建处理滤镜用的新 Canvas
            // 必须手动绘制，因为 cropper.js 导出的 canvas 不包含 CSS filter
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = sourceCanvas.width;
            finalCanvas.height = sourceCanvas.height;
            const ctx = finalCanvas.getContext('2d');

            // 3. 应用滤镜
            // 注意：Canvas filter 语法与 CSS 略有不同，数值通常是百分比字符串
            // 检查浏览器支持情况，Electron (Chromium) 支持 ctx.filter
            ctx.filter = `brightness(${this.params.brightness}%) contrast(${this.params.contrast}%)`;
            
            // 4. 绘制
            ctx.drawImage(sourceCanvas, 0, 0);

            // 5. 导出
            const format = this.dom.format.value;
            const quality = parseInt(this.dom.quality.value) / 100;

            finalCanvas.toBlob(async (blob) => {
                if (!blob) {
                    this.dom.saveBtn.disabled = false;
                    return this._notify('错误', '生成 Blob 失败', 'error');
                }

                const arrayBuffer = await blob.arrayBuffer();
                const ext = format.split('/')[1];
                const defaultPath = `${this.filename}_edited.${ext}`;

                const result = await window.electronAPI.saveMedia({
                    buffer: arrayBuffer,
                    defaultPath: defaultPath
                });

                this.dom.saveBtn.disabled = false;
                this.dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';

                if (result.success) {
                    this._notify('成功', '图片已保存', 'success');
                } else if (result.error !== '用户取消保存') {
                    this._notify('失败', result.error, 'error');
                }

            }, format, quality);

        } catch (error) {
            console.error(error);
            this._notify('错误', error.message, 'error');
            this.dom.saveBtn.disabled = false;
            this.dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';
        }
    }
}

export default ImageProcessorTool;
