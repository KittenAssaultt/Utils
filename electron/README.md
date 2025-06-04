# Utils 工具集

基于Electron和Vue 3开发的跨平台工具集应用。

## 功能特点

- 多种实用工具集成
- 自动更新功能
- 跨平台支持 (Windows, macOS, Linux)
- 美观的UI界面
- 图库管理功能
- 多种工具集成

## 开发指南

### 环境准备

- Node.js >= 16.x
- npm >= 8.x

### 安装依赖

```bash
cd electron
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

根据不同平台选择构建命令：

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

### 发布新版本

发布新版本到GitHub，支持自动更新：

```bash
npm run publish
```

## 自动更新

本应用支持自动检查和安装更新。当有新版本发布时，应用会自动提示用户更新。

### 更新流程

1. 应用启动时会自动检查更新
2. 用户可以在设置页面手动检查更新
3. 发现更新后，会显示下载按钮
4. 下载完成后，会提示用户安装更新
5. 用户可以选择立即安装或稍后安装

## 许可证

MIT 