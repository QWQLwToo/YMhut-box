# **📦 YMhut Box (弈鸣工具箱)**

**一个集现代化 UI、灵动交互与硬核功能于一体的桌面端效率工具平台。**

**YMhut Box** 是基于 Electron 构建的模块化工具箱应用。

摒弃了传统工具箱死板的界面，YMhut Box 使用了 **“灵动岛” (Dynamic Island) UI 设计理念**，支持物理级拖拽交互、自适应深色模式以及沉浸式的使用体验。

## **✨ 核心亮点**

### **🎨 极致的 UI/UX 体验**

* **灵动侧边栏 V3**：支持物理模拟的拖拽滚动，带有动态光影指引与呼吸灯效，解决了点击与拖拽的冲突，操作手感丝滑。  
* **自适应布局**：智能响应式分页系统，根据窗口大小实时计算网格布局，完美利用每一寸屏幕空间。  
* **沉浸式设计**：全融合无边框输入组、移除滚动条的“一镜到底”视觉设计，以及细腻的玻璃拟态 (Glassmorphism) 效果。  
* **双模适配**：完美适配系统的深色 (Dark) 与浅色 (Light) 模式，细致到每一个原生下拉菜单和日期控件。

### **🛠️ 强大的模块化工具库**

内置 40+ 款实用工具，涵盖开发、网络、生活、娱乐等多个领域：

* **💻 开发调试**：JSON 格式化/压缩、正则测试、代码混淆/加密、Base64/URL 转换、时间戳转换。  
* **🔒 安全隐私**：HMAC/MD5 哈希生成、高强度密码生成器、文本/文件加密打包。  
* **🌐 网络诊断**：多源 IP 归属地查询、DNS 解析、微信域名拦截检测、网络测速。  
* **📊 数据可视**：全网热搜聚合 (Hotboard)、流量统计图表、系统硬件监控 (CPU/内存)。  
* **🎨 多媒体处理**：图片工坊 (裁剪/滤镜)、二维码生成、随机放映室、媒体播放器。  
* **🧮 实用计算**：科学计算器、全能单位转换、保质期智能推算、颜色拾取器。

### **🚀 架构特性**

* **远程动态配置**：支持通过 update-info.json 和 tool-status.json 远程控制工具开关、发布公告及管理下载线路。  
* **多线路更新系统**：内置智能更新模块，支持直连下载与网页中转（网盘）下载，解决单线路拥堵问题。  
* **安全沙箱**：基于 ContextIsolation 和 Preload 桥接的安全架构，确保渲染进程与系统底层的安全隔离。  
* **高性能存储**：采用 better-sqlite3 本地加密存储日志与用户配置。

## **📸 界面预览**

*(建议在此处替换为您实际软件的截图，例如 GIF 动图展示拖拽交互)*

| 主页仪表盘 | 工具箱视图 |
| :---- | :---- |
|  |  |

| 灵动岛设置页 | 沉浸式工具 |
| :---- | :---- |
|  |  |

## **🏗️ 开发与构建指南**

### **环境要求**

* **Node.js**: 建议 v18.15（本人使用的这个版本）  
* **Python**: 用于编译原生模块 (node-gyp)  
* **Visual Studio Build Tools**: Windows 环境编译 better-sqlite3 等原生依赖需要

### **1\. 克隆项目**

git clone [https://github.com/QWQLwToo/YMhut-box.git\](https://github.com/QWQLwToo/YMhut-box.git) 
cd box

### **2\. 安装依赖**

npm install

### **3\. 重建原生模块**

本项目使用了 better-sqlite3、systeminformation 等原生模块，必须针对 Electron 版本进行重编译：

npm run rebuild

### **4\. 启动开发模式**

npm run start:dev

### **5\. 打包构建**

构建生产环境安装包（脚本会自动调用 build-scripts/build.js 进行源码混淆保护与资源处理）：

**Windows:**

npm run dist:win

*输出目录: installer/ (包含 .exe 安装包)*

**Linux:** *Linux版本还未正常开发*

npm run dist:linux

## **📂 项目结构概览**

YMhut-box/  
├── build-scripts/       \# 构建脚本  
│   ├── build.js         \# 核心构建逻辑 (混淆、资源拷贝)  
│   ├── config-template.ini \# 配置文件模板  
│   └── installer.nsh    \# NSIS 安装脚本 (自定义安装流程)  
├── config/              \# 数据库配置类 (Database)  
├── server/              \# 远程配置文件示例 (Mock Data)  
├── src/                 \# 源代码  
│   ├── assets/          \# 静态资源 (图标、字体)  
│   ├── css/             \# 全局样式 (style.css \- 灵动岛核心样式)  
│   ├── js/              \# 渲染进程逻辑  
│   │   ├── tools/       \# 40+ 工具模块实现 (BaseTool 继承)  
│   │   ├── workers/     \# 多线程 Worker (解压缩、加解密)  
│   │   ├── mainPage.js  \# 主页核心逻辑  
│   │   ├── uiManager.js \# UI 管理器 (路由、侧边栏交互)  
│   │   └── ...  
│   └── views/           \# HTML 视图模板 (主页、独立工具窗、浏览器)  
├── main.js              \# Electron 主进程入口 (IPC 处理、窗口管理)  
├── preload.js           \# 预加载脚本 (ContextBridge 安全桥接)  
└── package.json         \# 项目依赖与脚本配置

## **⚙️ 远程配置说明**

YMhut Box 支持远程控制能力，您可以在服务器端部署以下 JSON 文件来实现动态管理：

1. **update-info.json**:  
   * 控制版本更新检测。  
   * 配置多线路下载源 (download\_mirrors)。  
   * 发布首页公告 (home\_notes)。  
2. **tool-status.json**:  
   * 远程熔断机制：可实时禁用某个报错的工具。  
   * 显示维护信息。  
3. **media-types.json**:  
   * 控制“随机放映室”的内容源 API 和分类结构。

## **🤝 贡献指南**

我非常欢迎社区贡献！如果您有新的工具想法或 Bug 修复：

1. Fork 本仓库  
2. 新建特性分支 (git checkout \-b feat/AmazingFeature)  
3. 提交更改 (git commit \-m 'Add some AmazingFeature')  
4. 推送到分支 (git push origin feat/AmazingFeature)  
5. 提交 Pull Request

## **📄 开源协议**

本项目遵循 **MIT License** 开源协议。

**致谢与依赖：**

* [Electron](https://www.electronjs.org/)  
* [FontAwesome](https://fontawesome.com/) (Icons)  
* [Chart.js](https://www.chartjs.org/) (Charts)  
* [Better-Sqlite3](https://github.com/WiseLibs/better-sqlite3) (Database)  
* [Cropper.js](https://github.com/fengyuanchen/cropperjs) (Image Editing)

\<p align="center"\>  
Designed with ❤️ by \<strong\>YMHUT\</strong\>  
\</p\>
