!macro preInit
    # 这个宏会在安装程序初始化时执行
    # 我们可以在这里定义一些变量，比如安装子目录的名称
    !define APP_install_dir "bin"
!macroend


!macro customInit
    # 这个宏会在文件安装开始前执行
    
    # 核心修改：在这里改变输出路径
    # 所有后续的文件都会被安装到这个子目录中
    SetOutPath "$INSTDIR\${APP_install_dir}"
!macroend


!macro customInstall
    # 这个宏会在文件安装完成后执行

    # 1. 回到根目录
    SetOutPath "$INSTDIR"
  
    # 2. 创建一些看起来很“原生”的空目录来迷惑分析者
    CreateDirectory "$INSTDIR\data"
    CreateDirectory "$INSTDIR\lang"
    CreateDirectory "$INSTDIR\plugins"
  
    # 3. (可选) 创建一个伪装的配置文件
    FileOpen $0 "$INSTDIR\config.ini" w
    FileWrite $0 "[Settings]$\r$\n"
    # [最终修正] 将 ${APP_VERSION} 改为 electron-builder 提供的标准变量 ${VERSION}
    FileWrite $0 "Version=${VERSION}$\r$\n"
    FileWrite $0 "Language=auto$\r$\n"
    FileClose $0
!macroend


!macro customUninstall
    # 这个宏会在卸载时执行

    # 先删除我们在根目录创建的伪装文件和目录
    Delete "$INSTDIR\config.ini"
    RMDir "$INSTDIR\data"
    RMDir "$INSTDIR\lang"
    RMDir "$INSTDIR\plugins"

    # 然后删除包含所有核心文件的子目录
    RMDir /r "$INSTDIR\${APP_install_dir}"
!macroend


!macro customCreateShortcut
    # [重要] 修正桌面快捷方式的路径，使其指向子目录中的可执行文件
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_install_dir}\${APP_FILENAME}"
!macroend