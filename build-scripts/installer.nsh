; ============================================================================
; 终极修复版 V2 (Root-Bin 架构 | 修复文件名后缀问题)
; ============================================================================

!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "MUI2.nsh"

; ----------------------------------------------------------------------------
; 1. 定义启动函数 (修复编译报错 & 路径指向 bin)
; ----------------------------------------------------------------------------
!ifdef NSIS_WIN32_MAKENSIS
    !ifndef BUILD_UNINSTALLER
        Function LaunchBinApp
            ; [修复] 添加 .exe 后缀
            ExecShell "" "$INSTDIR\bin\${APP_FILENAME}.exe"
        FunctionEnd
        
        ; ---------------- [修改开始] ----------------
        ; 注释掉以下三行以移除安装完成后的“运行”选项
        ; !define MUI_FINISHPAGE_RUN
        ; !define MUI_FINISHPAGE_RUN_TEXT "运行 ${PRODUCT_NAME}"
        ; !define MUI_FINISHPAGE_RUN_FUNCTION "LaunchBinApp"
        ; ---------------- [修改结束] ----------------
    !endif
!endif

; ----------------------------------------------------------------------------
; [阶段 1] 初始化
; ----------------------------------------------------------------------------
!macro customInit
    ; 读取注册表
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "InstallLocation"
    ${If} $0 != ""
        StrCpy $INSTDIR $0
    ${EndIf}

    ; 防套娃检查 (检查 .exe 是否存在)
    ${GetFileName} "$INSTDIR" $R0
    ${If} $R0 == "${PRODUCT_FILENAME}"
        ${GetParent} "$INSTDIR" $R1
        IfFileExists "$R1\config.ini" fix_path 0
        IfFileExists "$R1\data" fix_path 0
        Goto check_done
        fix_path:
        StrCpy $INSTDIR "$R1"
    ${EndIf}
    check_done:
!macroend

; ----------------------------------------------------------------------------
; [阶段 2] 安装执行 (核心：文件移动)
; ----------------------------------------------------------------------------
!macro customInstall
    SetOutPath "$INSTDIR"

    ; 1. 建立目录
    CreateDirectory "$INSTDIR\bin"
    CreateDirectory "$INSTDIR\data"

    ; 2. 处理 config.ini
    IfFileExists "$INSTDIR\config.ini" config_ready 0
    IfFileExists "$INSTDIR\resources\config-template.ini" 0 try_root_template
        CopyFiles "$INSTDIR\resources\config-template.ini" "$INSTDIR\config.ini"
        Goto patch_version
    try_root_template:
    IfFileExists "$INSTDIR\config-template.ini" 0 config_ready
        CopyFiles "$INSTDIR\config-template.ini" "$INSTDIR\config.ini"
    
    patch_version:
        nsExec::ExecToStack 'powershell -Command "(Get-Content -Path \"$INSTDIR\config.ini\" -Raw) -replace \"Version=.*\", \"Version=${VERSION}\" | Set-Content -Path \"$INSTDIR\config.ini\" -Encoding utf8"'
    config_ready:

    ; 3. 移动文件夹
    RMDir /r "$INSTDIR\bin\resources"
    Rename "$INSTDIR\resources" "$INSTDIR\bin\resources"

    RMDir /r "$INSTDIR\bin\locales"
    Rename "$INSTDIR\locales" "$INSTDIR\bin\locales"
    
    RMDir /r "$INSTDIR\bin\lang"
    Rename "$INSTDIR\lang" "$INSTDIR\bin\lang"

    ; 4. [关键修复] 移动主程序 EXE 到 Bin (显式添加 .exe)
    ; 先清理目标
    Delete "$INSTDIR\bin\${APP_FILENAME}.exe"
    
    ; 尝试重命名移动
    Rename "$INSTDIR\${APP_FILENAME}.exe" "$INSTDIR\bin\${APP_FILENAME}.exe"
    
    ; [双重保险] 如果 Rename 失败（极少见），使用 Copy + Delete
    IfFileExists "$INSTDIR\bin\${APP_FILENAME}.exe" +3 0
    CopyFiles "$INSTDIR\${APP_FILENAME}.exe" "$INSTDIR\bin\${APP_FILENAME}.exe"
    Delete "$INSTDIR\${APP_FILENAME}.exe"

    ; 5. 移动依赖文件
    ; 清理旧文件
    Delete "$INSTDIR\bin\*.dll"
    Delete "$INSTDIR\bin\*.pak"
    Delete "$INSTDIR\bin\*.bin"
    Delete "$INSTDIR\bin\*.dat"
    Delete "$INSTDIR\bin\*.json"
    Delete "$INSTDIR\bin\LICENSE*"
    Delete "$INSTDIR\bin\version"
    Delete "$INSTDIR\bin\*.ico"

    ; 移动新文件
    CopyFiles "$INSTDIR\*.dll" "$INSTDIR\bin"
    Delete "$INSTDIR\*.dll"
    
    CopyFiles "$INSTDIR\*.pak" "$INSTDIR\bin"
    Delete "$INSTDIR\*.pak"
    
    CopyFiles "$INSTDIR\*.bin" "$INSTDIR\bin"
    Delete "$INSTDIR\*.bin"
    
    CopyFiles "$INSTDIR\*.dat" "$INSTDIR\bin"
    Delete "$INSTDIR\*.dat"
    
    CopyFiles "$INSTDIR\*.json" "$INSTDIR\bin"
    Delete "$INSTDIR\*.json"
    
    CopyFiles "$INSTDIR\LICENSE*" "$INSTDIR\bin"
    Delete "$INSTDIR\LICENSE*"
    
    CopyFiles "$INSTDIR\version" "$INSTDIR\bin"
    Delete "$INSTDIR\version"
    
    CopyFiles "$INSTDIR\*.ico" "$INSTDIR\bin"
    Delete "$INSTDIR\*.ico"

    ; 清理临时文件
    Delete "$INSTDIR\config-template.ini"
!macroend

; ----------------------------------------------------------------------------
; [阶段 3] 卸载逻辑
; ----------------------------------------------------------------------------
!macro customUninstall
    ; 1. 暴力清理 bin
    RMDir /r "$INSTDIR\bin"
    
    ; 2. 清理根目录残留 (添加 .exe)
    Delete "$INSTDIR\${APP_FILENAME}.exe" 
    Delete "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
    Delete "$INSTDIR\Uninstall.exe"
    
    ; 3. 删除根目录
    RMDir "$INSTDIR"
!macroend

; ----------------------------------------------------------------------------
; [阶段 4] 拦截默认快捷方式
; ----------------------------------------------------------------------------
!macro customCreateShortcut
    ; 留空，手动创建
!macroend

; ----------------------------------------------------------------------------
; [阶段 5] 安装后处理
; ----------------------------------------------------------------------------
Function .onInstSuccess
    ; 1. 移动卸载程序
    Delete "$INSTDIR\bin\Uninstall.exe"
    
    IfFileExists "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe" 0 try_short_name
        Rename "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe" "$INSTDIR\bin\Uninstall.exe"
        Goto reg_fix
    try_short_name:
        Rename "$INSTDIR\Uninstall.exe" "$INSTDIR\bin\Uninstall.exe"

    reg_fix:
    ; 2. 修正注册表 (添加 .exe)
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "DisplayIcon" "$INSTDIR\bin\${APP_FILENAME}.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "UninstallString" "$INSTDIR\bin\Uninstall.exe"
    
    ; 3. 创建快捷方式
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
    
    SetOutPath "$INSTDIR\bin"
    
    ; [关键修复] 指向 bin 下的 .exe
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\bin\${APP_FILENAME}.exe"
    
    CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\bin\${APP_FILENAME}.exe"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall.lnk" "$INSTDIR\bin\Uninstall.exe"
FunctionEnd