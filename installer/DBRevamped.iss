; DB Revamped launcher installer (Inno Setup 6).
;
; Build:  "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer\DBRevamped.iss
; Output: dist\DB Revamped Setup.exe
;
; Installs per user (no admin prompt) into %LOCALAPPDATA%\DB Revamped, with a Start Menu entry,
; an optional desktop shortcut and an entry in Settings > Apps for uninstalling. The launcher is
; DungeonBlitzR.hta run by Windows' own mshta.exe; its screen is launcher-assets\ui.js, installed
; with it. A change to the launcher screen means a new installer.

#define AppName "DB Revamped"
#define AppVersion "1.1.3"
#define AppPublisher "DB Revamped"
#define AppUrl "https://dungeonblitzv.duckdns.org"

[Setup]
AppId={{42173429-E4AE-4E5A-B637-FEB103416E65}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppUrl}
AppSupportURL={#AppUrl}
DefaultDirName={localappdata}\{#AppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=DB Revamped Setup
SetupIconFile=db-revamped.ico
UninstallDisplayIcon={app}\db-revamped.ico
UninstallDisplayName={#AppName}
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x86compatible x64compatible arm64
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\DungeonBlitzR.hta"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\flashplayer.exe"; DestDir: "{app}"; Flags: ignoreversion
; The AIR engine (node air\build.js): the game in AIR's runtime, up to 100 fps. The launcher starts
; it instead of flashplayer.exe unless the player switched back to Flash.
Source: "..\air\bundle\*"; DestDir: "{app}\air"; Flags: ignoreversion recursesubdirs createallsubdirs
; The launcher screen, loaded by DungeonBlitzR.hta.
Source: "..\launcher-assets\ui.js"; DestDir: "{app}\launcher-assets"; Flags: ignoreversion
Source: "db-revamped.ico"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; Installer 1.1.1's starter, which opened mshta to give the taskbar button our icon. Windows
; Defender took it for Trojan:Win32/Bearfoos.B!ml (a small unsigned program starting mshta) and
; removed it, with the Start Menu shortcut, on players' PCs (2026-10-27). The shortcuts open mshta
; directly again; the taskbar shows mshta's own icon.
Type: files; Name: "{app}\DB Revamped Launcher.exe"

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{sys}\mshta.exe"; Parameters: """{app}\DungeonBlitzR.hta"""; WorkingDir: "{app}"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped"
Name: "{autodesktop}\{#AppName}"; Filename: "{sys}\mshta.exe"; Parameters: """{app}\DungeonBlitzR.hta"""; WorkingDir: "{app}"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped"; Tasks: desktopicon

; No "Start now" at the end: setup starting mshta was itself flagged by Defender
; (Behavior:Win32/Execution.A!ml, 2026-10-27). Players open the launcher from its shortcut.

[UninstallDelete]
; The remembered sign-in (a device token); uninstalling signs this PC out.
Type: filesandordirs; Name: "{userappdata}\DBRevamped"
