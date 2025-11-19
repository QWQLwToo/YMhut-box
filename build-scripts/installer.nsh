{
type: uploaded file
fileName: installer.nsh
fullContent:
!macro preInit
    # 这里不需要操作
!macroend

!macro customInit
    # 设置安装路径
    SetOutPath "$INSTDIR"
    
    # [关键步骤 1：升级前备份数据]
    # 检查是否存在旧的 data 文件夹
    IfFileExists "$INSTDIR\data\*.*" 0 skip_backup
    
    # 如果存在，将其重命名为 data_upgrade_backup
    # 这样做可以防止安装程序在解压新文件时意外覆盖或删除它
    DetailPrint "检测到旧数据，正在备份..."
    Rename "$INSTDIR\data" "$INSTDIR\data_upgrade_backup"
    
    skip_backup:
!macroend

!macro customInstall
    SetOutPath "$INSTDIR"
  
    # 创建插件目录
    CreateDirectory "$INSTDIR\plugins"

    # [关键步骤 2：升级后还原数据]
    # 检查是否存在备份文件夹
    IfFileExists "$INSTDIR\data_upgrade_backup\*.*" 0 skip_restore
    
    DetailPrint "正在还原用户数据..."
    
    # 1. 如果安装包里包含了一个空的 data 文件夹（如果有），先删除它以防冲突
    RMDir /r "$INSTDIR\data"
    
    # 2. 将备份文件夹重命名回 data
    Rename "$INSTDIR\data_upgrade_backup" "$INSTDIR\data"
    
    skip_restore:

    # --- 处理 config.ini (保留用户配置) ---
    SetOutPath "$INSTDIR"
    File /nonfatal "config-template.ini"
    
    IfFileExists "$INSTDIR\config.ini" +2
        # 如果 config.ini 不存在(全新安装)，将模板重命名为 config.ini
        Rename "$INSTDIR\config-template.ini" "$INSTDIR\config.ini"
        
    # 如果 config.ini 存在(升级安装)，删除模板，保留用户的 config.ini
    Delete "$INSTDIR\config-template.ini"
    
    # --- 替换 config.ini 中的版本号 ---
    # 无论是否保留了配置，都强制更新版本号标记，方便 main.js 读取
    nsExec::ExecToStack 'powershell -Command "(Get-Content -Path \"$INSTDIR\config.ini\" -Raw) -replace \"\${VERSION}\", \"${VERSION}\" | Set-Content -Path \"$INSTDIR\config.ini\" -Encoding utf8"'
!macroend

!macro customUninstall
    # [修复 3：卸载/升级时保护数据]
    
    # 删除配置文件 (可选：如果你希望完全清除，可以取消注释)
    # Delete "$INSTDIR\config.ini"
    
    # [重要修复] 不要默认删除 data 文件夹！
    # 升级覆盖安装时，NSIS 有时会运行卸载步骤。保留此文件夹可确保数据安全。
    # 只有当用户手动删除文件夹时才会真正清除。
    # RMDir /r "$INSTDIR\data" 
    
    # 删除其他目录 (这些是程序生成的或安装的，可以安全删除)
    RMDir /r "$INSTDIR\plugins"
    RMDir /r "$INSTDIR\resources" 
    RMDir /r "$INSTDIR\locales"
    
    # 删除主程序文件
    Delete "$INSTDIR\${APP_FILENAME}"
    Delete "$INSTDIR\LICENSE.electron.txt"
    Delete "$INSTDIR\LICENSES.chromium.html"
    
    # 移除空的安装目录 (如果 data 还在，这个命令会失败，从而保留目录)
    RMDir "$INSTDIR"
!macroend

!macro customCreateShortcut
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_FILENAME}"
!macroend
}