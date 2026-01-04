document.addEventListener('DOMContentLoaded', async () => {
    const progressBar = document.getElementById('splash-progress-bar');
    const statusText = document.getElementById('splash-status');

    window.electronAPI.onInitProgress(({ status, progress }) => {
        statusText.textContent = status;
        progressBar.style.width = `${progress}%`;
    });

    try {
        const result = await window.electronAPI.runInitialization();

        if (result.success) {
            statusText.textContent = '初始化完成，即将启动...';
            progressBar.style.width = '100%';
            
            window.electronAPI.initializationComplete(result);
        } else {
            statusText.textContent = `启动失败: ${result.error}`;
        }
    } catch (error) {
        statusText.textContent = `发生严重错误: ${error.message}`;
    }
});