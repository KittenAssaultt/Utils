import {
    app,
    BrowserWindow,
    ipcMain,
    nativeTheme,
    shell,
    dialog,
    Tray,
    Menu,
    clipboard,
    globalShortcut,
    Notification
} from 'electron'
import {join} from 'path'
import { autoUpdater } from 'electron-updater'

const fs = require('fs')
const os = require('os');
import {electronApp, is, optimizer} from '@electron-toolkit/utils'
import {
    downloadImageToClipboard,
    getHttpImage, getPath,
    openPublicDialog,
} from '../renderer/src/assets/ts/Utils/ElectronMain'
// @ts-ignore
import icon from '../../resources/icon.png?asset'
// @ts-ignore
import ico from '../renderer/src/assets/img/logo.png?asset'
import * as path from 'path'

let mainWindow: Electron.BrowserWindow

// 配置自动更新
function setupAutoUpdater() {
    // 如果是开发环境，不执行自动更新
    if (is.dev) {
        return
    }
    
    // 设置自动下载更新
    autoUpdater.autoDownload = true
    
    // 检查更新出错
    autoUpdater.on('error', (error) => {
        const errorMessage = error == null ? '未知错误' : (error.message || error.toString())
        mainWindow.webContents.send('update-error', errorMessage)
    })
    
    // 检查更新
    autoUpdater.on('checking-for-update', () => {
        mainWindow.webContents.send('checking-for-update')
    })
    
    // 有可用更新
    autoUpdater.on('update-available', (info) => {
        mainWindow.webContents.send('update-available', info)
    })
    
    // 没有可用更新
    autoUpdater.on('update-not-available', (info) => {
        mainWindow.webContents.send('update-not-available', info)
    })
    
    // 更新下载进度
    autoUpdater.on('download-progress', (progressObj) => {
        mainWindow.webContents.send('download-progress', progressObj)
    })
    
    // 更新下载完成，准备安装
    autoUpdater.on('update-downloaded', (info) => {
        mainWindow.webContents.send('update-downloaded', info)
        
        // 提示用户是否立即安装更新
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '安装更新',
            message: '更新已下载，应用将重启并安装更新',
            buttons: ['立即安装', '稍后安装']
        }).then(result => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall(false, true)
            }
        })
    })
    
    // 监听来自渲染进程的检查更新请求
    ipcMain.on('check-for-updates', () => {
        autoUpdater.checkForUpdates()
    })
    
    // 监听来自渲染进程的下载更新请求
    ipcMain.on('download-update', () => {
        autoUpdater.downloadUpdate()
    })
    
    // 监听来自渲染进程的安装更新请求
    ipcMain.on('install-update', () => {
        autoUpdater.quitAndInstall(false, true)
    })
    
    // 在应用启动后自动检查更新
    setTimeout(() => {
        autoUpdater.checkForUpdates()
    }, 3000) // 延迟3秒检查，确保应用完全启动
}

function createWindow(): void {

    /**
     * 主窗口
     */
    mainWindow = new BrowserWindow({
        width: 1120,
        height: 790,
        minWidth: 911,
        minHeight: 685,
        show: false,
        frame: true,
        titleBarStyle: 'hidden',
        autoHideMenuBar: true,
        backgroundColor: "#00000000",
        vibrancy: "under-window", // in my case...
        visualEffectState: 'active',  // 保持视觉效果
        ...(process.platform === 'linux' ? {icon} : {}),
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            sandbox: false,
            webSecurity: false,
            contextIsolation: true, // 必须启用
            nodeIntegration: false, // 应该保持关闭
        }
    })

    // 在主进程 (main.js) 中忽略证书错误
    // @ts-ignore
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault();
        callback(true); // 允许自签名证书
    });

    // 获取文件夹路径
    ipcMain.on('getPath', () => {
        getPath(mainWindow)
    })



    // 监听名为 'windowsTop' 的 IPC 主进程事件
    ipcMain.on('windowsTop', () => {
        mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop(), 'screen-saver')
        mainWindow.webContents.send('returnTop', mainWindow.isAlwaysOnTop())
    })


    /**
     * 传入ArrayBuffer文件保存到路径
     * value[0][1] 选择路径
     * value[0][0] ArrayBuffer
     */
    ipcMain.on('write-blob-to-file', (_event, value) => {
        // 将接收到的ArrayBuffer转换为Buffer
        const data = Buffer.from(value[0][0]);
        // 写入文件
        fs.writeFile(value[0][1], data, (err: any) => {
            // 下载失败
            if (err) {
                mainWindow.webContents.send('ShowMessage', [false, '写入文件失败'])
                console.error("写入文件失败", err);
                return;
            }
            // 下载成功
            const dia = () => {
                new Notification({
                    title: '下载成功',
                    body: `已保存到 ${value[0][1]} 文件夹`
                }).show()
            }
            dia()
        });
    });

    // 公共的确认取消窗口
    ipcMain.on('openPublicDialog', () => {
    })


    /*
     * 设置和获取应用登录时启动的配置。
     * 'setLoginShow' 事件用于切换应用是否在系统启动时自动打开。
     * 'getLoginShow' 事件用于查询当前的登录启动设置，并将结果发送回渲染进程。
     *  监听来自渲染进程的 'setLoginShow' 事件
     */
    ipcMain.on('setLoginShow', () => {
        app.setLoginItemSettings({
            openAtLogin: !app.getLoginItemSettings().openAtLogin
        });
    });

    // 监听来自渲染进程的 'getLoginShow' 事件
    ipcMain.on('getLoginShow', () => {
        mainWindow.webContents.send('sendLoginShow', app.getLoginItemSettings().openAtLogin);
    });


    /**
     * Note 右键菜单
     * @value data[0] 笔记列表
     * @value data[1] 右键当前笔记数据
     */
    ipcMain.on('openNoteMenu', async (event, data) => {
        const categories = JSON.parse(data).noteListType
        const json = JSON.parse(data).json

        function createMenuOptions(category: string, parsedValue: string) {
            const isCurrentCategory = category === parsedValue;
            return {
                type: category === parsedValue ? 'radio' : undefined,
                group: category === parsedValue ? 'options' : undefined,
                checked: isCurrentCategory,
                enabled: !isCurrentCategory,
                label: category,
                click: () => {
                    let newCategory = category;
                    let newJson = json;
                    newJson.categoryId = newCategory
                    mainWindow.webContents.send('updateNote', JSON.stringify(newJson))
                }
            };
        }

        const template = [
            {
                label: ` 移动到... `,
                submenu: categories.map((category: string) => createMenuOptions(category, json.categoryId))
            },
            {type: 'separator'}, // 分隔符
            {label: ' 重命名 ', accelerator: 'command + M', click: () => { mainWindow.webContents.send('renameNote', JSON.stringify(json)) }},
            {label: ' 设置封面 ', accelerator: 'command + B', click: () => { mainWindow.webContents.send('setCover', {json, type: 'cover'}) }},
            {label: ' 删除笔记 ', accelerator: 'command + Q', click: () => {openPublicDialog(json.title, `是否删除 ${json.title} ?`, mainWindow, json);}},
            {type: 'separator'}, // 分隔符
            {
                label: ' 另存为 ', accelerator: 'command + E', click: () => {}
            },
            {type: 'separator'}, // 分隔符
            {label: ' 刷新', accelerator: 'command + R'},
            {
                label: ' 设置 ', click: () => {
                    mainWindow.webContents.send('routerSetting')
                }
            }
        ];

        // @ts-ignore
        const menu = Menu.buildFromTemplate(template);
        menu.popup({window: BrowserWindow.fromWebContents(event.sender)!});
    });


    /**
     * Web 右键菜单
     * @value 获取当前右键的 json 数据
     * accelerator：快捷键
     * checked：复选框
     * visible：是否显示
     */
    ipcMain.on('web-menu', (event, value) => {
        const categories = ['常用', '设计', '工具', '娱乐', '编程', '系统', '资源', '游戏', '开源'];
        const parsedValue = JSON.parse(value);
        const title = parsedValue.title

        function createMenuOptions(category: string, parsedValue: { type: any; }) {
            const isCurrentCategory = category === parsedValue.type;
            return {
                type: category === parsedValue.type ? 'radio' : undefined,
                group: category === parsedValue.type ? 'options' : undefined,
                checked: isCurrentCategory,
                enabled: !isCurrentCategory,
                label: category,
                click: () => {
                    let json = JSON.parse(value)
                    mainWindow.webContents.send('webUpdate', {json, category})
                }
            };
        }

        const template = [
            {
                label: ` 从 ${parsedValue.type} 移动到... `,
                submenu: categories.map(category => createMenuOptions(category, parsedValue))
            },
            {type: 'separator'}, // 分隔符
            {
                label: ' 编辑网站 ',
                accelerator: 'command + B',
                click: () => {
                    let json = JSON.parse(value)
                    mainWindow.webContents.send('webEdit', {json})
                }
            },
            {
                label: ' 删除网站 ', accelerator: 'command + Q', click: () => {
                    openPublicDialog(title, '是否删除此网站', mainWindow, parsedValue);
                }
            },
            {type: 'separator'}, // 分隔符
            {
                label: ' 复制网址 ', accelerator: 'command + C', click: () => {
                    clipboard.writeText(parsedValue.http);
                    NotificationShow(parsedValue.http)
                }
            },
            {label: ' 复制网站图标 ', accelerator: 'command + shift + C'},
            {type: 'separator'}, // 分隔符
            {label: ' 刷新页面... ', accelerator: 'command + R'},
            {
                label: ' 设置 ', click: () => {
                    mainWindow.webContents.send('routerSetting')
                }
            }
        ];

        // @ts-ignore
        const menu = Menu.buildFromTemplate(template);
        menu.popup({window: BrowserWindow.fromWebContents(event.sender)!});
    });


    /**
     * Dynamic 动态的右键菜单
     * @value 获取当前右键的 json 数据
     */
    ipcMain.on('my-menu', (event, value) => {

        let myJson = JSON.parse(value)

        const template = [
            {
                label: ' 置顶 ',
                accelerator: 'command + G',
                visible: myJson.isPinned === 0,
                checked: myJson.privacyFlag === 1,
                type: 'radio',
                group: 'ddqq',
                click: () => {
                    mainWindow.webContents.send('setIsPinned', ([myJson, 1]))
                }
            },
            {
                label: ' 取消置顶... ',
                accelerator: 'command + G',
                visible: myJson.isPinned === 1,
                checked: myJson.privacyFlag === 1,
                type: 'radio',
                group: 'ddqq',
                click: () => {
                    mainWindow.webContents.send('setIsPinned', ([myJson, 0]))
                }
            },

            {type: 'separator'}, // 分隔符

            {
                label: ' 编辑动态 ', accelerator: 'command + B', click: () => {
                    mainWindow.webContents.send('openMyEditDynamicDrawer', myJson)
                }
            },
            {label: ' 移到回收站 ', accelerator: 'command + Q', click: () => { openPublicDialog("确认删除动态", "删除动态", mainWindow, myJson) }},

            {type: 'separator'}, // 分隔符

            {
                label: ' 设为隐私 ',
                accelerator: 'command + shift + G',
                visible: myJson.privacyFlag === 1,
                checked: myJson.privacyFlag === 0,
                type: 'radio',
                group: 'dd',
                click: () => {
                    mainWindow.webContents.send('setPrivacyFlag', ([myJson, 0]))
                }
            },
            {
                label: ' 设为公开动态 ',
                accelerator: 'command + shift + G',
                visible: myJson.privacyFlag === 0,
                checked: myJson.privacyFlag === 0,
                type: 'radio',
                group: 'dd',
                click: () => {
                    mainWindow.webContents.send('setPrivacyFlag', ([myJson, 1]))
                }
            },
            {label: ' 刷新页面... ', accelerator: 'command + R'},

            {type: 'separator'}, // 分隔符
            {
                label: ' 设置 ', click: () => {
                    mainWindow.webContents.send('routerSetting')
                }
            }
        ];

        // @ts-ignore
        const menu = Menu.buildFromTemplate(template);
        menu.popup({window: BrowserWindow.fromWebContents(event.sender)!});
    });


    /**
     * TuKu 动态的右键菜单
     * @value 获取当前右键的 json 数据
     */
    ipcMain.on('open-tuku-menu', async (event, value) => {
        const categories = ['生活相册', '海报背景', '素材', '文字排版', '游戏相关'];
        const json = JSON.parse(value);
        console.log(json)

        function createMenuOptions(category: string, parsedValue: { type: any; }) {
            const isCurrentCategory = category === parsedValue.type;
            return {
                type: category === parsedValue.type ? 'radio' : undefined,
                group: category === parsedValue.type ? 'options' : undefined,
                checked: isCurrentCategory,
                enabled: !isCurrentCategory,
                label: category,
                click: () => {
                    let json = JSON.parse(value)
                    mainWindow.webContents.send('webUpdate', {json, category})
                }
            };
        }


        const template = [
            {
                label: ` 从 ${json.type} 移动到... `,
                submenu: categories.map(category => createMenuOptions(category, json))
            },
            {type: 'separator'}, // 分隔符
            {
                label: ' 编辑此图片 ', accelerator: 'command + B', click: () => {
                    mainWindow.webContents.send('webEdit', {json})
                }
            },
            {
                label: ' 删除图库 ', accelerator: 'command + Q', click: () => {
                    openPublicDialog(json.title, '是否删除此图片', mainWindow);
                }
            },
            {type: 'separator'}, // 分隔符
            {
                label: ' 复制图片 ', accelerator: 'command + C', click: () => {
                    downloadImageToClipboard(json.src, mainWindow)
                }
            },
            {
                label: ' 另存为 ', accelerator: 'command + E', click: () => {
                    getHttpImage(json.src, json.title, mainWindow)
                }
            },
            {type: 'separator'}, // 分隔符
            {label: ' 刷新页面... ', accelerator: 'command + R'},
            {
                label: ' 设置 ', click: () => {
                    mainWindow.webContents.send('routerSetting')
                }
            }
        ];

        // @ts-ignore
        const menu = Menu.buildFromTemplate(template);
        menu.popup({window: BrowserWindow.fromWebContents(event.sender)!});
    });


    /**
     * TuKu——ITEM 动态的右键菜单
     * @value 获取当前右键的 json 数据
     */
    ipcMain.on('open-tuku-menuitem', async (event, value) => {
        const TuKuJson = JSON.parse(value);

        const template = [
            {
                label: ' 删除图库 ', accelerator: 'command + Q', click: () => {
                    openPublicDialog(TuKuJson.title, '是否删除此图片', mainWindow);
                }
            },
            {type: 'separator'}, // 分隔符
            {
                label: ' 复制图片 ', accelerator: 'command + C', click: () => {
                    downloadImageToClipboard(TuKuJson.src, mainWindow)
                }
            },
            {
                label: ' 另存为 ', accelerator: 'command + E', click: () => {
                    getHttpImage(TuKuJson.src, TuKuJson.src, mainWindow)
                }
            },
            {type: 'separator'}, // 分隔符
            {label: ' 刷新页面... ', accelerator: 'command + R'},
            {
                label: ' 设置 ', click: () => {
                    mainWindow.webContents.send('routerSetting')
                }
            }
        ];

        // @ts-ignore
        const menu = Menu.buildFromTemplate(template);
        menu.popup({window: BrowserWindow.fromWebContents(event.sender)!});
    });


    /**
     * Bili_Image 哔哩哔哩图片的右键菜单
     */
    ipcMain.on('open-biliImage-menu', async (event, data) => {
        const template = [
            {
                label: ' 复制图片 ', accelerator: 'command + C', click: () => {
                    downloadImageToClipboard(data[0][0], mainWindow)
                }
            },
            {
                label: ' 另存为 ', accelerator: 'command + E', click: () => {
                    getHttpImage(data[0][0], data[0][1], mainWindow)
                }
            },
            {type: 'separator'}, // 分隔符
            {label: ' 刷新页面... ', accelerator: 'command + R'},
            {
                label: ' 设置 ', click: () => {
                    mainWindow.webContents.send('routerSetting')
                }
            }
        ];
        // @ts-ignore
        const menu = Menu.buildFromTemplate(template);
        menu.popup({window: BrowserWindow.fromWebContents(event.sender)!});
    });


    /**
     * Public Menu
     *
     * @selectText 传入选择的文本
     * clipboard.writeText: 写入剪贴板API
     */
    ipcMain.on('copyMenu', (event, selectText) => {
        event.preventDefault();
        if (!selectText) {
            return;
        }

        const template = [
            {
                label: ' 复制 ', accelerator: 'command + C',
                click: () => {
                    clipboard.writeText(selectText.toString());
                    mainWindow.webContents.send('ShowMessage', [true, '复制成功'])
                }
            },

            {type: 'separator'}, // 分隔符

            {label: ' 刷新页面... ', accelerator: 'command + R'},

            {type: 'separator'}, // 分隔符
            {
                label: ' 设置 ', click: () => {
                    mainWindow.webContents.send('routerSetting')
                }
            }
        ];

        // @ts-ignore
        const menu = Menu.buildFromTemplate(template);
        menu.popup({window: BrowserWindow.fromWebContents(event.sender)!});
    })


    /**
     * 系统通知
     * @导入 Notification
     * @param body
     */
    const NotificationShow = (body: string) => {
        new Notification({
            title: '剪贴板通知',
            body: body + '已复制到剪贴板'
        }).show()
    }
    //
    // let MAX_PROGRESS = 6000; // 设定最大进度值
    // let currentProgress = 0; // 当前进度
    // let INTERVAL_DELAY = 1000; // 设定进度条更新间隔（毫秒）
    // let STEP = 100;  // 步长
    //
    // let progressInterval = setInterval(() => {
    //   mainWindow.setProgressBar(currentProgress / MAX_PROGRESS); // 根据MAX_PROGRESS归一化进度值
    //
    //   if (currentProgress < MAX_PROGRESS) {
    //     currentProgress += STEP;
    //     tz(MAX_PROGRESS - currentProgress)
    //   } else {
    //     mainWindow.setProgressBar(-1); // 隐藏进度条
    //     clearInterval(progressInterval); // 清除定时器
    //   }
    // }, INTERVAL_DELAY);


    // 三大件功能
    ipcMain.on('window:state', (event, [action, value]) => {
        const window = BrowserWindow.getFocusedWindow() // 获取主进程窗口对象
        switch (action.toString()) {
            case 'maxZoom':
                window?.maximize()
                break
            case 'miniZoom':
                if (value === 1) {
                    mainWindow.hide()
                    createTray()
                } else if (value === 0) {
                    window?.minimize()
                } else if (value === undefined) {
                    window?.minimize()
                }
                break
            case 'unmaxZoom':
                window?.unmaximize()
                break
            case 'close':
                window?.close()
                break
        }
        event.returnValue
    })

    /**
     * 主题功能
     *   nativeTheme.shouldUseDarkColors 系统主题是什么 light=false / dark=true
     *   nativeTheme.themeSource         设置主题模式  light || dark || system
     */
    ipcMain.handle('1', async () => {
        return nativeTheme.themeSource = 'light'
    })
    ipcMain.handle('2', async () => {
        return nativeTheme.themeSource = 'dark'
    })
    // 跟随系统
    ipcMain.handle('theme:system', async () => {
        nativeTheme.themeSource = 'system'
        return nativeTheme.shouldUseDarkColors
    })
    // 根据现在的主题状态切换主题
    ipcMain.handle('theme', async () => {
        nativeTheme.themeSource = !nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
        return nativeTheme.shouldUseDarkColors
    })
    ipcMain.handle('getTheme', () => {
        return nativeTheme.shouldUseDarkColors
    })


    /*
      聚焦窗口，并聚焦搜索
    */
    const focus = () => {
        mainWindow.focus()
        if (mainWindow.isVisible()) {
            mainWindow.webContents.send('Ctrl+.', '1')
        } else { /* 窗口为隐藏状态时 */
            mainWindow.show() // 打开窗口
            tray.destroy() // 销毁托盘
            mainWindow.webContents.send('Ctrl+.', '1')
        }
    }





    /*
      注册快捷键
    */
    globalShortcut.register('CommandOrControl + .', () => {
        focus()
    })




    // Tray 托盘
    let tray: Tray
    const createTray = () => {
        // 菜单
        const template2 = [
            {
                label: '打开Utils',
                click: () => {
                    mainWindow.show()
                    tray.destroy() // 销毁托盘
                }
            },
            {
                label: '搜索',
                click: () => {
                    focus()
                }
            },
            {
                label: '退出',
                click: () => {
                    app.quit()
                }
            }
        ]
        const menu = Menu.buildFromTemplate(template2)

        // 托盘基本信息
        tray = new Tray(ico)
        tray.setTitle('Utils')
        tray.setToolTip('Utils')
        tray.setContextMenu(menu)
        tray.on('click', () => {
            mainWindow.show()
            tray.destroy() // 销毁托盘
        })
    }


    // 头像选择框
    ipcMain.on('select-avatar', (event, arg) => {
        console.log(arg)
        event.preventDefault()

        dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                {name: '图片格式', extensions: ['jpg', 'png', 'gif', 'HEIC']}
            ]
        }).then(response => {
            if (!response.canceled) {
                const filePath = response.filePaths[0]; // 获取第一个选定文件的路径
                const fileName = path.basename(filePath); // 获取文件名
                const extname = path.extname(filePath); // 获取文件名

                // 读取文件内容并转换为Base64编码
                fs.readFile(filePath, (err: any, data: WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>) => {
                    if (err) throw err;

                    // 发送文件名和Base64编码给渲染进程
                    const base64Data = Buffer.from(data).toString('base64');
                    mainWindow.webContents.send('selectAvatar', {fileName, base64Data, extname,})
                });
            }
        })
    })


    /**
     * 打开开发者工具
     *
     * isDevToolsOpened()  工具是否打开
     * openDevTools()      打开
     * closeDevTools()     关闭
     */
    ipcMain.on('openDevTools', () => {
        if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools();
        } else {
            mainWindow.webContents.openDevTools();
        }
    })

    // 返回当前系统
    ipcMain.handle('getSystem', () => {
        return os.platform()
    })

    // 启动时触发
    mainWindow.on('ready-to-show', async () => {
        mainWindow.setTitle('Utils');
        mainWindow.show()

    })

    // 窗口失焦时触发
    mainWindow.on('blur', () => {
        mainWindow.webContents.send('window-blur', 'blur')
    })

    // 退出时触发
    mainWindow.on('close', () => {
        app.quit()
    })

    // 最小化时触发
    // mainWindow.on('will-resize', (event, newBounds) => {
    //     event.preventDefault()

    //     // 由于使用了自定义三大件按钮，所以这里的value穿不进来值，value就会是空，就发送进程通信获取值
    //     if (newBounds === undefined) {
    //         mainWindow.webContents.send('Shortcut_minimize', 'mini')
    //     }

    // })

    // 系统级别最小化监听器获取设置数据里的值
    ipcMain.on('miniValue', (event1, args) => {
        event1.preventDefault()
        if (args.toString() === '1') {
            mainWindow.hide()
            createTray()
        } else if (args.toString() === '0') {
            mainWindow.minimize()
        }
    })


    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return {action: 'deny'}
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // 初始化自动更新
    setupAutoUpdater()
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // IPC test
    ipcMain.on('ping', () => console.log('pong'))

    createWindow()
    
    // 设置自动更新
    setupAutoUpdater()

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    // 设置PDF Worker
    setupPdfWorker()
})


// In this file you can include the rest of your apps specific main process
// code. You can also put them in separate files and require them here.

ipcMain.handle('lightIcon', async () => {
    /*  iconColor = '#000'
      backgroundColor = '#fff'*/
})

// 处理PDF Worker文件
function setupPdfWorker(): void {
  try {
    // 获取应用资源路径
    const resourcesPath = process.resourcesPath
    console.log('资源目录:', resourcesPath)
    
    // 尝试找到PDF Worker源文件
    const possibleSourcePaths = [
      join(resourcesPath, 'pdf.worker.min.mjs'),
      join(resourcesPath, 'app.asar.unpacked', 'pdf.worker.min.mjs'),
      join(resourcesPath, 'app.asar', 'out', 'renderer', 'assets', 'pdf.worker.min.mjs'),
      join(app.getAppPath(), 'out', 'renderer', 'assets', 'pdf.worker.min.mjs'),
      join(app.getAppPath(), 'pdf.worker.min.mjs')
    ]
    
    let sourceFile: string | null = null
    for (const path of possibleSourcePaths) {
      if (fs.existsSync(path)) {
        sourceFile = path
        console.log('找到PDF Worker源文件:', path)
        break
      }
    }
    
    if (!sourceFile) {
      console.log('无法找到PDF Worker源文件')
      return
    }
    
    // 目标路径
    const targetPaths = [
      join(resourcesPath, 'pdf.worker.min.mjs'),
      join(resourcesPath, 'app.asar', 'out', 'renderer', 'assets', 'pdf.worker.min.mjs'),
      join(app.getAppPath(), 'out', 'renderer', 'assets', 'pdf.worker.min.mjs')
    ]
    
    // 复制到每个目标路径
    for (const targetPath of targetPaths) {
      try {
        const targetDir = targetPath.substring(0, targetPath.lastIndexOf('/'))
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true })
        }
        
        fs.copyFileSync(sourceFile, targetPath)
        console.log('PDF Worker已复制到:', targetPath)
      } catch (err) {
        console.error('复制PDF Worker文件失败:', err)
      }
    }
  } catch (error) {
    console.error('PDF Worker设置失败:', error)
  }
}

// 添加接收并发送番茄钟通知的IPC监听器
ipcMain.on('pomodoro-notification', (_, title, body) => {
  // 使用Electron的Notification API发送系统通知
  new Notification({
    title,
    body,
    silent: false // 允许系统声音
  }).show()
})

