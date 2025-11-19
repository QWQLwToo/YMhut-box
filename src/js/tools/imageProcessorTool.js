// src/js/tools/imageProcessorTool.js
import BaseTool from '../baseTool.js';

class ImageProcessorTool extends BaseTool {
    constructor() {
        super('image-processor', '图片处理工坊');
        this.cropper = null;
        this.filename = 'image';
        this.scaleX = 1;
        this.scaleY = 1;
    }

    render() {
        // 动态加载 CropperJS 的 CSS
        const cssId = 'cropper-css';
        if (!document.getElementById(cssId)) {
            const link = document.createElement('link');
            link.id = cssId;
            link.rel = 'stylesheet';
            link.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css';
            document.head.appendChild(link);
        }

        return `
            <div class="page-container image-tool-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="section-header" style="justify-content: center; position: relative;">
                    <h1 style="text-align: center; margin: 0;"><i class="fas fa-magic"></i> ${this.name}</h1>
                    <button id="img-save-btn" class="action-btn ripple" style="position: absolute; right: 0;" disabled><i class="fas fa-save"></i> 保存</button>
                </div>

                <div class="content-area" style="padding: 10px 20px; flex-grow: 1; display: flex; gap: 20px; overflow: hidden;">
                    
                    <div class="img-canvas-container" style="flex: 1; background-color: #2c2c2c; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative;">
                        <div id="img-placeholder" style="text-align: center; color: #aaa; cursor: pointer; padding: 40px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                            <i class="fas fa-image" style="font-size: 48px; margin-bottom: 10px; pointer-events: none;"></i>
                            <p style="pointer-events: none;">点击上传或拖拽图片到此处</p>
                            <input type="file" id="img-upload-input" accept="image/*" style="display:none;">
                        </div>
                        <img id="img-editor-target" style="display: block; max-width: 100%; max-height: 100%; opacity: 0;">
                    </div>

                    <div class="img-controls-panel settings-section" style="width: 320px; display: flex; flex-direction: column; gap: 15px; overflow-y: auto; margin-bottom: 0;">
                        
                        <div class="custom-select-group">
                            <div class="img-control-group-title">基础操作</div>
                            <div class="tool-grid-small">
                                <button class="control-btn mini-btn ripple" id="btn-upload"><i class="fas fa-upload"></i> 换图</button>
                                <button class="control-btn mini-btn ripple" id="btn-reset"><i class="fas fa-undo"></i> 重置</button>
                            </div>
                        </div>

                        <div class="custom-select-group">
                            <div class="img-control-group-title">裁剪 & 几何</div>
                            <div class="tool-grid-small">
                                <button class="control-btn mini-btn ripple" id="btn-rotate-left" title="左旋转"><i class="fas fa-undo-alt"></i></button>
                                <button class="control-btn mini-btn ripple" id="btn-rotate-right" title="右旋转"><i class="fas fa-redo-alt"></i></button>
                                <button class="control-btn mini-btn ripple" id="btn-flip-h" title="水平翻转"><i class="fas fa-arrows-alt-h"></i></button>
                                <button class="control-btn mini-btn ripple" id="btn-flip-v" title="垂直翻转"><i class="fas fa-arrows-alt-v"></i></button>
                            </div>
                            <div class="tool-grid-small" style="margin-top: 8px;">
                                <button class="control-btn mini-btn ripple" id="btn-ratio-free">自由</button>
                                <button class="control-btn mini-btn ripple" id="btn-ratio-11">1:1</button>
                                <button class="control-btn mini-btn ripple" id="btn-ratio-169">16:9</button>
                                <button class="control-btn mini-btn ripple" id="btn-crop-apply" title="仅预览裁剪框，保存时自动应用"><i class="fas fa-crop-alt"></i> 裁剪模式</button>
                            </div>
                        </div>

                        <div class="custom-select-group">
                            <div class="img-control-group-title">分辨率 (保存时生效)</div>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <input type="number" id="img-width" class="settings-input-text" placeholder="宽" style="width: 80px;">
                                <span>x</span>
                                <input type="number" id="img-height" class="settings-input-text" placeholder="高" style="width: 80px;">
                            </div>
                        </div>

                        <div class="custom-select-group">
                            <div class="img-control-group-title">滤镜调节</div>
                            <div class="setting-item" style="margin-bottom: 5px;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="font-size: 12px;">亮度</span>
                                    <span id="val-brightness" style="font-size: 12px;">100%</span>
                                </div>
                                <input type="range" id="filter-brightness" min="0" max="200" value="100" style="width: 100%;">
                            </div>
                            <div class="setting-item" style="margin-bottom: 5px;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="font-size: 12px;">对比度</span>
                                    <span id="val-contrast" style="font-size: 12px;">100%</span>
                                </div>
                                <input type="range" id="filter-contrast" min="0" max="200" value="100" style="width: 100%;">
                            </div>
                        </div>

                        <div class="custom-select-group">
                            <div class="img-control-group-title">导出与压缩</div>
                            <div class="setting-item">
                                <span style="font-size: 12px;">格式</span>
                                <select id="img-format" class="settings-input-text" style="width: 100%;">
                                    <option value="image/jpeg">JPG (推荐)</option>
                                    <option value="image/png">PNG (无损/透明)</option>
                                    <option value="image/webp">WEBP (高压缩)</option>
                                </select>
                            </div>
                            <div class="setting-item" style="margin-top: 10px;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="font-size: 12px;">质量 (压缩率)</span>
                                    <span id="img-quality-val" style="font-size: 12px;">90%</span>
                                </div>
                                <input type="range" id="img-quality" min="1" max="100" value="90" style="width: 100%;">
                            </div>
                        </div>

                    </div>
                </div>
            </div>
            <style>
                .tool-grid-small { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
                .img-canvas-container img { transition: filter 0.1s ease; }
            </style>
        `;
    }

    init() {
        this._log('图片处理工具初始化');
        
        // 绑定 DOM
        this.dom = {
            uploadInput: document.getElementById('img-upload-input'),
            uploadPlaceholder: document.getElementById('img-placeholder'),
            targetImg: document.getElementById('img-editor-target'),
            saveBtn: document.getElementById('img-save-btn'),
            widthInput: document.getElementById('img-width'),
            heightInput: document.getElementById('img-height'),
            qualitySlider: document.getElementById('img-quality'),
            qualityVal: document.getElementById('img-quality-val'),
            formatSelect: document.getElementById('img-format'),
            filterBrightness: document.getElementById('filter-brightness'),
            filterContrast: document.getElementById('filter-contrast'),
            valBrightness: document.getElementById('val-brightness'),
            valContrast: document.getElementById('val-contrast'),
            canvasContainer: document.querySelector('.img-canvas-container')
        };

        // 修复点击逻辑：直接绑定点击事件触发 input
        this.dom.uploadPlaceholder.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止冒泡问题
            this.dom.uploadInput.click();
        });
        
        document.getElementById('btn-upload').addEventListener('click', () => this.dom.uploadInput.click());
        this.dom.uploadInput.addEventListener('change', (e) => this._handleFileSelect(e));

        // Cropper 控制绑定
        this._bindCropperControls();

        // 实时滤镜预览
        const updateFilter = () => {
            const b = this.dom.filterBrightness.value;
            const c = this.dom.filterContrast.value;
            this.dom.valBrightness.textContent = `${b}%`;
            this.dom.valContrast.textContent = `${c}%`;
            
            // 应用 CSS 滤镜到预览容器 (Cropper 会包裹 img，所以我们设置容器样式或者 img 样式)
            // 注意：Cropper.js 可能会重置 img 的 style，所以更好的方式是加在 cropper-canvas 上
            const cropperCanvas = document.querySelector('.cropper-canvas');
            if (cropperCanvas) {
                cropperCanvas.style.filter = `brightness(${b}%) contrast(${c}%)`;
            } else if (this.dom.targetImg) {
                this.dom.targetImg.style.filter = `brightness(${b}%) contrast(${c}%)`;
            }
        };
        
        this.dom.filterBrightness.addEventListener('input', updateFilter);
        this.dom.filterContrast.addEventListener('input', updateFilter);

        // Quality UI
        this.dom.qualitySlider.addEventListener('input', (e) => {
            this.dom.qualityVal.textContent = `${e.target.value}%`;
        });

        // Save
        this.dom.saveBtn.addEventListener('click', () => this._saveImage());

        // 拖拽支持
        this.dom.canvasContainer.addEventListener('dragover', (e) => { e.preventDefault(); this.dom.canvasContainer.style.borderColor = 'var(--primary-color)'; });
        this.dom.canvasContainer.addEventListener('dragleave', (e) => { e.preventDefault(); this.dom.canvasContainer.style.borderColor = ''; });
        this.dom.canvasContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dom.canvasContainer.style.borderColor = '';
            const files = e.dataTransfer.files;
            if (files.length > 0) this._loadFile(files[0]);
        });
    }

    _bindCropperControls() {
        document.getElementById('btn-rotate-left').addEventListener('click', () => this.cropper?.rotate(-90));
        document.getElementById('btn-rotate-right').addEventListener('click', () => this.cropper?.rotate(90));
        
        document.getElementById('btn-flip-h').addEventListener('click', () => {
            this.scaleX = -this.scaleX;
            this.cropper?.scaleX(this.scaleX);
        });
        document.getElementById('btn-flip-v').addEventListener('click', () => {
            this.scaleY = -this.scaleY;
            this.cropper?.scaleY(this.scaleY);
        });
        
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.cropper?.reset();
            this.scaleX = 1; 
            this.scaleY = 1;
            this.dom.filterBrightness.value = 100;
            this.dom.filterContrast.value = 100;
            this.dom.valBrightness.textContent = '100%';
            this.dom.valContrast.textContent = '100%';
            const cropperCanvas = document.querySelector('.cropper-canvas');
            if(cropperCanvas) cropperCanvas.style.filter = 'none';
        });

        // 比例
        document.getElementById('btn-ratio-free').addEventListener('click', () => this.cropper?.setAspectRatio(NaN));
        document.getElementById('btn-ratio-11').addEventListener('click', () => this.cropper?.setAspectRatio(1));
        document.getElementById('btn-ratio-169').addEventListener('click', () => this.cropper?.setAspectRatio(16/9));
        document.getElementById('btn-crop-apply').addEventListener('click', () => {
            this.cropper?.setDragMode('crop');
            this._notify('模式切换', '请在图片上拖拽以调整裁剪框', 'info');
        });
    }

    _handleFileSelect(e) {
        if (e.target.files && e.target.files.length > 0) {
            this._loadFile(e.target.files[0]);
        }
    }

    _loadFile(file) {
        if (!file.type.startsWith('image/')) {
            this._notify('错误', '请选择有效的图片文件', 'error');
            return;
        }
        this.filename = file.name.split('.')[0];
        
        const reader = new FileReader();
        reader.onload = (e) => {
            // 重置状态
            if (this.cropper) {
                this.cropper.destroy();
            }
            this.scaleX = 1;
            this.scaleY = 1;

            this.dom.targetImg.src = e.target.result;
            this.dom.targetImg.style.opacity = '1';
            this.dom.uploadPlaceholder.style.display = 'none';
            this.dom.saveBtn.disabled = false;
            
            // 初始化 Cropper
            // 必须等待图片加载完成
            // 使用 setTimeout 确保 DOM 更新
            setTimeout(() => {
                this.dom.widthInput.value = this.dom.targetImg.naturalWidth;
                this.dom.heightInput.value = this.dom.targetImg.naturalHeight;
                
                this.cropper = new Cropper(this.dom.targetImg, {
                    viewMode: 1,
                    dragMode: 'move',
                    autoCropArea: 1,
                    restore: false,
                    guides: true,
                    center: true,
                    highlight: false,
                    cropBoxMovable: true,
                    cropBoxResizable: true,
                    toggleDragModeOnDblclick: false,
                    ready: () => {
                        this._log('Cropper ready');
                        // 重新应用滤镜（如果有）
                        const b = this.dom.filterBrightness.value;
                        const c = this.dom.filterContrast.value;
                        const cropperCanvas = document.querySelector('.cropper-canvas');
                        if(cropperCanvas) cropperCanvas.style.filter = `brightness(${b}%) contrast(${c}%)`;
                    }
                });
            }, 100);
        };
        reader.readAsDataURL(file);
    }

    async _saveImage() {
        if (!this.cropper) return;

        this.dom.saveBtn.disabled = true;
        this.dom.saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';

        try {
            const width = parseInt(this.dom.widthInput.value) || undefined;
            const height = parseInt(this.dom.heightInput.value) || undefined;
            const quality = parseInt(this.dom.qualitySlider.value) / 100;
            const format = this.dom.formatSelect.value;

            // 1. 获取裁剪后的 Canvas
            let canvas = this.cropper.getCroppedCanvas({
                width: width,
                height: height,
                imageSmoothingQuality: 'high',
                fillColor: format === 'image/jpeg' ? '#ffffff' : 'transparent' // JPG 填充白色背景
            });

            if (!canvas) throw new Error('无法生成画布，请检查图片是否有效');

            // 2. 应用滤镜 (Canvas 级别的处理)
            const brightness = this.dom.filterBrightness.value;
            const contrast = this.dom.filterContrast.value;
            
            if (brightness !== '100' || contrast !== '100') {
                const filterCanvas = document.createElement('canvas');
                filterCanvas.width = canvas.width;
                filterCanvas.height = canvas.height;
                const ctx = filterCanvas.getContext('2d');
                // 应用 CSS 滤镜字符串
                ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
                ctx.drawImage(canvas, 0, 0);
                canvas = filterCanvas;
            }

            // 3. 导出 Blob
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    this.dom.saveBtn.disabled = false;
                    this.dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';
                    this._notify('错误', '图片生成失败', 'error');
                    return;
                }
                
                const arrayBuffer = await blob.arrayBuffer();
                const ext = format.split('/')[1];
                const defaultPath = `${this.filename}_edited.${ext}`;

                const result = await window.electronAPI.saveMedia({
                    buffer: arrayBuffer,
                    defaultPath: defaultPath
                });

                if (result.success) {
                    this._notify('成功', '图片已保存', 'success');
                }
                this.dom.saveBtn.disabled = false;
                this.dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';

            }, format, quality);

        } catch (error) {
            this._notify('错误', error.message, 'error');
            this.dom.saveBtn.disabled = false;
            this.dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';
        }
    }

    destroy() {
        if (this.cropper) this.cropper.destroy();
        const link = document.getElementById('cropper-css');
        if (link) link.remove();
        super.destroy();
    }
}

export default ImageProcessorTool;