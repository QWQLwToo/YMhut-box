// 通常，此类文件包含阻止用户打开开发者工具的逻辑，例如：
document.addEventListener('keydown', function (event) {
    if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key === 'I')) {
        event.preventDefault();
    }
});
document.addEventListener('contextmenu', event => event.preventDefault());