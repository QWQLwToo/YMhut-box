// src/js/splash.js

document.addEventListener('DOMContentLoaded', async () => {
    const progressBar = document.getElementById('splash-progress-bar');
    const statusText = document.getElementById('splash-status');
    const percentText = document.getElementById('splash-percent');

    let currentProgress = 0;
    let targetProgress = 0;
    let animationFrameId;

    // 缓动动画：更平滑的阻尼效果
    const updateUI = () => {
        // 距离目标的差值
        const diff = targetProgress - currentProgress;
        
        // 动态速度：距离越远跑得越快，距离近了慢慢停下
        // 0.08 的系数比之前的更小，意味着动画更“粘稠”、更有质感
        if (Math.abs(diff) > 0.1) {
            currentProgress += diff * 0.08;
        } else {
            currentProgress = targetProgress;
        }

        // 更新 DOM
        const displayPercent = Math.floor(currentProgress);
        progressBar.style.width = `${currentProgress}%`;
        percentText.textContent = `${displayPercent}%`;

        // 如果还没停止
        if (currentProgress < 100 && (Math.abs(diff) > 0.1 || targetProgress < 100)) {
            animationFrameId = requestAnimationFrame(updateUI);
        } else if (currentProgress >= 99.9) {
            // 确保最后定格在 100%
            progressBar.style.width = '100%';
            percentText.textContent = '100%';
        }
    };

    window.electronAPI.onInitProgress(({ status, progress }) => {
        // 文字带有轻微的淡入淡出效果 (可选优化)
        statusText.style.opacity = 0;
        setTimeout(() => {
            statusText.textContent = status;
            statusText.style.opacity = 0.7;
        }, 150);

        targetProgress = progress;
        
        if (!animationFrameId) {
            updateUI();
        }
    });

    try {
        const result = await window.electronAPI.runInitialization();

        if (result.success) {
            targetProgress = 100;
            // 确保动画还在跑
            if (!animationFrameId) updateUI();

            statusText.style.color = 'var(--success-color)';
            statusText.textContent = '检查完毕，正在启动...';
            
            // 给予用户 1.2秒 的时间看到 "100%" 和 "检查完毕"
            // 因为 main.js 已经有了延时，这里的延时是为了展示最终完成态
            setTimeout(() => {
                window.electronAPI.initializationComplete(result);
            }, 1200);
        } else {
            statusText.style.color = 'var(--error-color)';
            statusText.textContent = `启动失败: ${result.error}`;
        }
    } catch (error) {
        statusText.style.color = 'var(--error-color)';
        statusText.textContent = `严重错误: ${error.message}`;
    }
});