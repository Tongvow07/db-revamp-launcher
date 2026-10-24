; DB Revamped launcher installer (Inno Setup 6).
;
; Build:  "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer\DBRevamped.iss
; Output: dist\DB Revamped Setup.exe
;
; Installs per user (no admin prompt) into %LOCALAPPDATA%\DB Revamped, with a Start Menu entry,
; an optional desktop shortcut and an entry in Settings > Apps for uninstalling. The launcher is
; DungeonBlitzR.hta run by Windows' own mshta.exe (opened by DB Revamped Launcher.exe, for the
; taskbar icon); its screen (ui.js) is downloaded from the
; server at every start, so this installer rarely needs rebuilding: only when the shell, the
; Flash player, the AIR engine or the icon change.

#define AppName "DB Revamped"
#define AppVersion "1.1.1"
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
; Offline fallback for the launcher screen; the live one comes from the server.
Source: "..\launcher-assets\ui.js"; DestDir: "{app}\launcher-assets"; Flags: ignoreversion
Source: "db-revamped.ico"; DestDir: "{app}"; Flags: ignoreversion
; Opens the launcher and gives its taskbar button our icon (build-launcher-start.ps1); mshta on its
; own shows its generic icon there.
Source: "DB Revamped Launcher.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\DB Revamped Launcher.exe"; WorkingDir: "{app}"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\DB Revamped Launcher.exe"; WorkingDir: "{app}"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped"; Tasks: desktopicon

[Run]
Filename: "{app}\DB Revamped Launcher.exe"; WorkingDir: "{app}"; Description: "Start {#AppName} now"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
; The remembered sign-in (a device token); uninstalling signs this PC out.
Type: filesandordirs; Name: "{userappdata}\DBRevamped"
