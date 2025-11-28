; LazyLabel Windows Installer Script
; Created with NSIS (Nullsoft Scriptable Install System)
; Download NSIS from: https://nsis.sourceforge.io/Download

;--------------------------------
; Includes

!include "MUI2.nsh"
!include "FileFunc.nsh"

;--------------------------------
; General Configuration

; Application name and version
!define APP_NAME "LazyLabel"
!define APP_VERSION "1.4.0"
!define APP_PUBLISHER "Deniz N. Cakan"
!define APP_URL "https://github.com/dnzckn/LazyLabel"
!define APP_DESCRIPTION "AI-Assisted Image Segmentation for Machine Learning"

; Installer name
Name "${APP_NAME} ${APP_VERSION}"
OutFile "LazyLabel-${APP_VERSION}-Setup.exe"

; Installation directory
InstallDir "$PROGRAMFILES64\${APP_NAME}"

; Request administrator privileges
RequestExecutionLevel admin

; Compression
SetCompressor /SOLID lzma

;--------------------------------
; Interface Settings

!define MUI_ABORTWARNING
!define MUI_ICON "..\..\..\src\lazylabel\demo_pictures\logo2.ico"
!define MUI_UNICON "..\..\..\src\lazylabel\demo_pictures\logo2.ico"

; Welcome page
!define MUI_WELCOMEPAGE_TITLE "Welcome to ${APP_NAME} Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of ${APP_NAME}.$\r$\n$\r$\n${APP_DESCRIPTION}$\r$\n$\r$\nThis is a large application (~8 GB) and includes all AI models for offline use.$\r$\n$\r$\nClick Next to continue."

;--------------------------------
; Pages

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\..\..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

;--------------------------------
; Languages

!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Installer Sections

Section "MainSection" SEC01
    SetOutPath "$INSTDIR"

    ; Set overwrite mode
    SetOverwrite on

    ; Copy all files from dist\LazyLabel
    File /r "..\..\..\dist\LazyLabel\*.*"

    ; Create shortcuts
    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\LazyLabel.exe"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\LazyLabel.exe"

    ; Write uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Write registry keys for Add/Remove Programs
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                     "DisplayName" "${APP_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                     "DisplayVersion" "${APP_VERSION}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                     "Publisher" "${APP_PUBLISHER}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                     "URLInfoAbout" "${APP_URL}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                     "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                     "DisplayIcon" "$INSTDIR\LazyLabel.exe"

    ; Calculate and write installation size
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                       "EstimatedSize" "$0"

SectionEnd

;--------------------------------
; Uninstaller Section

Section "Uninstall"
    ; Remove files
    RMDir /r "$INSTDIR"

    ; Remove shortcuts
    Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
    Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
    Delete "$DESKTOP\${APP_NAME}.lnk"
    RMDir "$SMPROGRAMS\${APP_NAME}"

    ; Remove registry keys
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

SectionEnd

;--------------------------------
; Installer Functions

Function .onInit
    ; Check if already installed
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString"
    StrCmp $R0 "" done

    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
        "${APP_NAME} is already installed.$\n$\nClick OK to remove the previous version or Cancel to cancel this upgrade." \
        IDOK uninst
    Abort

    uninst:
        ClearErrors
        ExecWait '$R0 _?=$INSTDIR'
        IfErrors no_remove_uninstaller done

    no_remove_uninstaller:
        Delete $R0
        RMDir $INSTDIR

    done:
FunctionEnd

;--------------------------------
; Descriptions

LangString DESC_MainSection ${LANG_ENGLISH} "Main application files and AI models"

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC01} $(DESC_MainSection)
!insertmacro MUI_FUNCTION_DESCRIPTION_END
