// src/js/tools/mediaPlayerTool.js
import BaseTool from '../baseTool.js';
import configManager from '../configManager.js'; // 确保导入 configManager

class MediaPlayerTool extends BaseTool {
    constructor() {
        super('media-player', '媒体播放器');
        this.playlist = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.volume = parseFloat(localStorage.getItem('mp_volume') || '0.8');
        
        this.controlsTimeout = null;
        this.slideTimer = null;
        this.isFullScreen = false;
    }

    render() {
        // [优化] 控制栏布局：更合理的分布
        return `
            <div class="page-container mp-container">
                <div id="mp-header-island" class="section-header tool-window-header mp-header">
                    <button id="back-to-toolbox-btn" class="back-btn ripple"><i class="fas fa-arrow-left"></i> 返回</button>
                    <h1 style="flex-grow: 1; text-align: center; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">${this.name}</h1>
                    <button id="mp-toggle-playlist" class="control-btn ripple active" title="播放列表">
                        <i class="fas fa-list-ul"></i>
                    </button>
                </div>

                <div class="mp-workspace">
                    <div class="mp-screen-island" id="mp-drop-zone">
                        
                        <div id="mp-media-wrapper" class="mp-media-wrapper">
                            <img id="mp-img" class="mp-element" style="display: none;">
                            <video id="mp-video" class="mp-element" style="display: none;" playsinline></video>
                            
                            <div id="mp-audio-visual" class="mp-element mp-audio-visual" style="display: none;">
                                <div class="audio-icon-glow"><i class="fas fa-compact-disc fa-spin" style="animation-duration: 4s;"></i></div>
                                <div class="audio-wave">
                                    <span></span><span></span><span></span><span></span><span></span>
                                </div>
                                <h3 id="mp-audio-title" style="margin-top:20px; color:rgba(255,255,255,0.9);">未知音频</h3>
                            </div>
                        </div>

                        <div id="mp-placeholder" class="mp-placeholder">
                            <div class="placeholder-icon"><i class="fas fa-photo-video"></i></div>
                            <h3 style="color: rgba(255,255,255,0.8);">拖拽媒体文件至此</h3>
                            <p style="color: rgba(255,255,255,0.5);">支持 视频 / 音频 / 图片 (双击全屏)</p>
                            <button id="mp-open-btn" class="action-btn ripple mt-3" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);">
                                <i class="fas fa-folder-open"></i> 打开文件
                            </button>
                        </div>

                        <div class="mp-control-island disabled" id="mp-controls">
                            <div class="mp-progress-container" id="mp-progress-container">
                                <div class="mp-progress-track">
                                    <div class="mp-progress-fill" id="mp-progress-fill" style="width: 0%"></div>
                                </div>
                            </div>

                            <div class="mp-control-row" style="margin-top: 8px;">
                                <div class="mp-buttons">
                                    <button id="mp-prev-btn" class="mp-icon-btn ripple" title="上一曲"><i class="fas fa-step-backward"></i></button>
                                    <button id="mp-play-btn" class="mp-main-btn ripple" title="播放/暂停"><i class="fas fa-play"></i></button>
                                    <button id="mp-next-btn" class="mp-icon-btn ripple" title="下一曲"><i class="fas fa-step-forward"></i></button>
                                </div>

                                <div class="mp-info" style="text-align: center; flex-grow: 1;">
                                    <span id="mp-current-time">00:00</span> <span style="opacity:0.5;">/</span> <span id="mp-remaining-time">-00:00</span>
                                </div>

                                <div class="mp-extras" style="gap: 15px;">
                                    <div class="mp-volume-wrap">
                                        <button id="mp-mute-btn" class="mp-icon-btn"><i class="fas fa-volume-up"></i></button>
                                        <input type="range" id="mp-volume-slider" min="0" max="1" step="0.05" value="${this.volume}">
                                    </div>
                                    <button id="mp-fullscreen-btn" class="mp-icon-btn ripple" title="全屏 (双击屏幕)"><i class="fas fa-expand"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="mp-playlist-island active" id="mp-playlist-panel">
                        <div class="playlist-header">
                            <span>播放列表 (<span id="mp-list-count">0</span>)</span>
                            <button id="mp-clear-list" class="control-btn mini-btn ripple"><i class="fas fa-trash-alt"></i></button>
                        </div>
                        <div id="mp-playlist-content" class="playlist-content">
                            <div class="empty-list-tip">暂无文件</div>
                        </div>
                        <div class="playlist-footer">
                            <button id="mp-add-more-btn" class="action-btn mini-btn ripple" style="width: 100%;">
                                <i class="fas fa-plus"></i> 添加更多
                            </button>
                        </div>
                    </div>
                </div>
                
                <input type="file" id="mp-file-input" style="display: none;" multiple accept="image/*,video/*,audio/*">
            </div>
        `;
    }

    init() {
        this._log('媒体播放器初始化');
        
        const backBtn = document.getElementById('back-to-toolbox-btn');
        if (backBtn) backBtn.addEventListener('click', () => window.electronAPI.closeCurrentWindow());

        this.dom = {
            // ... (同前)
            placeholder: document.getElementById('mp-placeholder'),
            mediaWrapper: document.getElementById('mp-media-wrapper'),
            img: document.getElementById('mp-img'),
            video: document.getElementById('mp-video'),
            audioVisual: document.getElementById('mp-audio-visual'),
            audioTitle: document.getElementById('mp-audio-title'),
            controls: document.getElementById('mp-controls'),
            header: document.getElementById('mp-header-island'),
            
            playBtn: document.getElementById('mp-play-btn'),
            prevBtn: document.getElementById('mp-prev-btn'),
            nextBtn: document.getElementById('mp-next-btn'),
            fullscreenBtn: document.getElementById('mp-fullscreen-btn'),
            
            progressContainer: document.getElementById('mp-progress-container'),
            progressFill: document.getElementById('mp-progress-fill'),
            currentTime: document.getElementById('mp-current-time'),
            remainingTime: document.getElementById('mp-remaining-time'), // [新增]
            
            volumeSlider: document.getElementById('mp-volume-slider'),
            muteBtn: document.getElementById('mp-mute-btn'),
            
            playlistPanel: document.getElementById('mp-playlist-panel'),
            playlistContent: document.getElementById('mp-playlist-content'),
            listCount: document.getElementById('mp-list-count'),
            togglePlaylistBtn: document.getElementById('mp-toggle-playlist'),
            
            input: document.getElementById('mp-file-input'),
            dropZone: document.getElementById('mp-drop-zone')
        };

        this._updateVolumeSliderUI(this.volume); // 初始化音量条颜色
        this._bindEvents();
    }

    _bindEvents() {
        // ... (文件操作/拖拽逻辑同前) ...
        document.getElementById('mp-open-btn').addEventListener('click', () => this.dom.input.click());
        document.getElementById('mp-add-more-btn').addEventListener('click', () => this.dom.input.click());
        document.getElementById('mp-clear-list').addEventListener('click', () => this._clearPlaylist());
        this.dom.input.addEventListener('change', (e) => this._handleFiles(Array.from(e.target.files)));

        // 拖拽
        this.dom.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); this.dom.dropZone.classList.add('drag-over'); });
        this.dom.dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); this.dom.dropZone.classList.remove('drag-over'); });
        this.dom.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dom.dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) this._handleFiles(Array.from(e.dataTransfer.files));
        });

        // 播放控制
        this.dom.playBtn.addEventListener('click', () => this._togglePlay());
        this.dom.prevBtn.addEventListener('click', () => this._playPrev());
        this.dom.nextBtn.addEventListener('click', () => this._playNext());
        
        // [新增] 全屏逻辑
        const toggleFull = () => this._toggleFullScreen();
        this.dom.fullscreenBtn.addEventListener('click', toggleFull);
        this.dom.dropZone.addEventListener('dblclick', toggleFull); // 双击全屏

        // 进度条点击
        this.dom.progressContainer.addEventListener('click', (e) => {
            const media = this.dom.video;
            if (!media || !media.duration) return;
            const rect = this.dom.progressContainer.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            media.currentTime = percent * media.duration;
        });

        // 音量控制
        this.dom.volumeSlider.addEventListener('input', (e) => this._setVolume(e.target.value));
        this.dom.muteBtn.addEventListener('click', () => this._toggleMute());

        // 播放列表开关
        this.dom.togglePlaylistBtn.addEventListener('click', () => {
            this.dom.playlistPanel.classList.toggle('active');
            this.dom.togglePlaylistBtn.classList.toggle('active');
        });

        // [优化] 控制栏自动隐藏
        const wakeControls = () => {
            this.dom.controls.classList.remove('hidden');
            this.dom.header.classList.remove('hidden');
            this.dom.dropZone.style.cursor = 'default';
            
            if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
            
            if (this.isPlaying) {
                this.controlsTimeout = setTimeout(() => {
                    this.dom.controls.classList.add('hidden');
                    this.dom.header.classList.add('hidden');
                    this.dom.dropZone.style.cursor = 'none'; // 隐藏鼠标
                }, 3000);
            }
        };
        this.dom.dropZone.addEventListener('mousemove', wakeControls);
        this.dom.dropZone.addEventListener('click', wakeControls);
        this.dom.dropZone.addEventListener('mouseleave', () => {
            if (this.isPlaying) {
                this.dom.controls.classList.add('hidden');
                this.dom.header.classList.add('hidden');
            }
        });

        document.addEventListener('keydown', (e) => this._handleKeydown(e));
    }

    _handleFiles(files) {
        // ... (处理文件逻辑同前) ...
        const validFiles = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/'));
        if (validFiles.length === 0) return this._notify('提示', '文件格式不支持', 'info');

        validFiles.forEach(file => {
            this.playlist.push({ name: file.name, type: file.type, url: URL.createObjectURL(file) });
        });
        this._renderPlaylist();
        if (this.currentIndex === -1) this._playIndex(this.playlist.length - validFiles.length);
    }

    _renderPlaylist() {
        // ... (渲染列表逻辑同前) ...
        this.dom.listCount.textContent = this.playlist.length;
        if (this.playlist.length === 0) {
            this.dom.playlistContent.innerHTML = '<div class="empty-list-tip">暂无文件</div>';
            this.dom.placeholder.style.display = 'flex';
            this.dom.controls.classList.add('disabled');
            return;
        } else {
            this.dom.placeholder.style.display = 'none';
            this.dom.controls.classList.remove('disabled');
        }

        this.dom.playlistContent.innerHTML = this.playlist.map((item, index) => {
            const isActive = index === this.currentIndex ? 'active' : '';
            let icon = 'fa-file';
            if (item.type.startsWith('image/')) icon = 'fa-image';
            else if (item.type.startsWith('video/')) icon = 'fa-video';
            else if (item.type.startsWith('audio/')) icon = 'fa-music';

            return `
                <div class="playlist-item ${isActive}" data-index="${index}">
                    <div class="pl-icon"><i class="fas ${icon}"></i></div>
                    <div class="pl-name" title="${item.name}">${item.name}</div>
                    <div class="pl-anim">${isActive && this.isPlaying ? '<i class="fas fa-chart-bar fa-beat"></i>' : ''}</div>
                </div>
            `;
        }).join('');

        this.dom.playlistContent.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => this._playIndex(parseInt(item.dataset.index)));
        });
    }

    _playIndex(index) {
        if (index < 0 || index >= this.playlist.length) return;
        this._stopCurrent();
        this.currentIndex = index;
        const item = this.playlist[index];
        
        this.dom.img.style.display = 'none';
        this.dom.video.style.display = 'none';
        this.dom.audioVisual.style.display = 'none';
        this._renderPlaylist();

        if (item.type.startsWith('image/')) {
            this.dom.img.src = item.url;
            this.dom.img.style.display = 'block';
            this._setupImageMode();
        } else {
            const isAudio = item.type.startsWith('audio/');
            this.dom.video.src = item.url;
            this.dom.video.style.display = isAudio ? 'none' : 'block';
            this.dom.audioVisual.style.display = isAudio ? 'flex' : 'none';
            if (isAudio) this.dom.audioTitle.textContent = item.name;
            
            this.dom.video.volume = this.volume;
            this.dom.video.load();
            this._setupMediaEvents(this.dom.video);
            
            this.dom.video.play().catch(e => console.error("自动播放受阻:", e));
        }
    }

    _stopCurrent() {
        if (this.dom.video) {
            this.dom.video.pause();
            this.dom.video.src = "";
            this.dom.video.ontimeupdate = null;
            this.dom.video.onloadedmetadata = null;
            this.dom.video.ondurationchange = null; // 清除所有监听
            this.dom.video.onended = null;
        }
        if (this.slideTimer) clearTimeout(this.slideTimer);
        this.isPlaying = false;
        this._updatePlayButtonUI();
    }

    // [修复] 处理时长显示 (00:00 问题)
    _setupMediaEvents(media) {
        this.isPlaying = true;
        this._updatePlayButtonUI();
        
        // 显示时间
        this.dom.currentTime.style.display = 'inline';
        this.dom.remainingTime.style.display = 'inline';

        const updateTimeDisplay = () => {
            const duration = media.duration;
            const current = media.currentTime;
            
            if (duration && !isNaN(duration) && duration !== Infinity) {
                const remaining = duration - current;
                this.dom.currentTime.textContent = this._formatTime(current);
                // [优化] 显示剩余时长 (负数)
                this.dom.remainingTime.textContent = '-' + this._formatTime(remaining);
                
                const percent = (current / duration) * 100;
                this.dom.progressFill.style.width = `${percent}%`;
            } else {
                // 如果没有时长 (例如流媒体或未加载完)
                this.dom.currentTime.textContent = this._formatTime(current);
                this.dom.remainingTime.textContent = '--:--';
            }
        };

        // 绑定多个事件以确保获取到时长
        media.onloadedmetadata = updateTimeDisplay;
        media.ondurationchange = updateTimeDisplay;
        media.ontimeupdate = updateTimeDisplay;

        media.onended = () => {
            this.isPlaying = false;
            this._updatePlayButtonUI();
            this._playNext();
        };
    }

    _setupImageMode() {
        this.isPlaying = true;
        this._updatePlayButtonUI();
        this.dom.progressFill.style.width = '100%';
        
        // [优化] 图片模式隐藏时间
        this.dom.currentTime.textContent = '';
        this.dom.remainingTime.textContent = '';
        
        // 幻灯片 5秒
        this.slideTimer = setTimeout(() => {
            if (this.isPlaying) this._playNext();
        }, 5000);
    }

    _togglePlay() {
        const item = this.playlist[this.currentIndex];
        if (!item) return;

        if (item.type.startsWith('image/')) {
            this.isPlaying = !this.isPlaying;
            if (this.isPlaying) this._playNext();
            else clearTimeout(this.slideTimer);
        } else {
            if (this.dom.video.paused) {
                this.dom.video.play();
                this.isPlaying = true;
            } else {
                this.dom.video.pause();
                this.isPlaying = false;
            }
        }
        this._updatePlayButtonUI();
    }

    _updatePlayButtonUI() {
        const icon = this.isPlaying ? 'fa-pause' : 'fa-play';
        this.dom.playBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        
        const activeItemAnim = this.dom.playlistContent.querySelector('.playlist-item.active .pl-anim');
        if (activeItemAnim) {
            activeItemAnim.innerHTML = this.isPlaying ? '<i class="fas fa-chart-bar fa-beat"></i>' : '';
        }
    }

    _playNext() {
        let next = this.currentIndex + 1;
        if (next >= this.playlist.length) next = 0;
        this._playIndex(next);
    }

    _playPrev() {
        let prev = this.currentIndex - 1;
        if (prev < 0) prev = this.playlist.length - 1;
        this._playIndex(prev);
    }

    _setVolume(val) {
        this.volume = parseFloat(val);
        localStorage.setItem('mp_volume', this.volume);
        if (this.dom.video) this.dom.video.volume = this.volume;
        
        const icon = this.dom.muteBtn.querySelector('i');
        if (this.volume === 0) icon.className = 'fas fa-volume-mute';
        else if (this.volume < 0.5) icon.className = 'fas fa-volume-down';
        else icon.className = 'fas fa-volume-up';
        
        this._updateVolumeSliderUI(this.volume);
    }
    
    // [新增] 动态更新音量条背景
    _updateVolumeSliderUI(value) {
        const percentage = value * 100;
        // 使用 CSS 渐变作为填充
        this.dom.volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${percentage}%, rgba(255,255,255,0.2) ${percentage}%)`;
    }

    _toggleMute() {
        if (this.volume > 0) {
            this.lastVolume = this.volume;
            this._setVolume(0);
            this.dom.volumeSlider.value = 0;
        } else {
            const v = this.lastVolume || 0.8;
            this._setVolume(v);
            this.dom.volumeSlider.value = v;
        }
    }

    _toggleFullScreen() {
        if (!document.fullscreenElement) {
            this.dom.dropZone.requestFullscreen().catch(err => console.warn(err));
            this.isFullScreen = true;
            this.dom.fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        } else {
            document.exitFullscreen();
            this.isFullScreen = false;
            this.dom.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    }

    _clearPlaylist() {
        this._stopCurrent();
        this.playlist = [];
        this.currentIndex = -1;
        this.dom.img.style.display = 'none';
        this.dom.video.style.display = 'none';
        this.dom.audioVisual.style.display = 'none';
        this._renderPlaylist();
    }

    _formatTime(seconds) {
        if (!seconds || isNaN(seconds) || seconds === Infinity) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    _handleKeydown(e) {
        if (e.code === 'Space') { e.preventDefault(); this._togglePlay(); }
        else if (e.code === 'ArrowRight') { if (this.dom.video) this.dom.video.currentTime += 5; }
        else if (e.code === 'ArrowLeft') { if (this.dom.video) this.dom.video.currentTime -= 5; }
        else if (e.code === 'Enter' && e.altKey) { this._toggleFullScreen(); } // Alt+Enter 全屏
    }

    destroy() {
        this._stopCurrent();
        this.playlist.forEach(item => URL.revokeObjectURL(item.url));
        super.destroy();
    }
}

export default MediaPlayerTool;