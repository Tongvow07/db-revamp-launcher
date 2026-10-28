; DB Revamped installer (Inno Setup 6).
;
; Build:  "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer\DBRevamped.iss
; Output: dist\DB Revamped Setup.exe
;
; Installs per user (no admin prompt) into %LOCALAPPDATA%\DB Revamped, with a Start Menu entry,
; an optional desktop shortcut and an entry in Settings > Apps for uninstalling.
;
; 1.3.0: the launcher window is back. The main shortcuts open DungeonBlitzR.hta in Windows' own
; mshta.exe; its screen is launcher-assets\ui.js, installed beside it. The launcher signs in,
; registers, sends account transfers, and starts the game in the engine the player picks on its
; Play view: the AIR app (air\DB Revamped.exe, up to 100 fps) or Adobe's Flash Player 32 projector
; (flashplayer.exe, about 0.4-0.5 GB less memory, for low-end PCs). The choice is remembered in
; %APPDATA%\DBRevamped\engine.txt. The game itself is never bundled: either engine loads it from
; the server at every start, so every start runs the current game with every patch.
;
; Defender history (2026-10-27), so nobody reintroduces what was flagged:
;   1.1.1  a small unsigned starter exe that opened mshta: Trojan:Win32/Bearfoos.B!ml.
;   1.1.2  setup started mshta when it finished, and the HTA downloaded ui.js from the server and
;          eval'd it: Behavior:Win32/Execution.A!ml (the shape of a trojan loader).
;   1.1.3  the HTA loads only the installed ui.js as a plain script, server replies go through
;          JSON.parse, and setup starts nothing.
;   1.2.0  no launcher at all; the shortcuts opened the AIR game directly.
;   1.2.1  a Classic Flash shortcut with Adobe's unmodified, validly signed projector (the 4 GB and
;          1 ms timer patches strip Adobe's signature, which reads as a tampered file).
; The launcher runs only installed code: nothing is downloaded and executed by the launcher, no
; starter exe, no post-install run. Keep it that way. A change to the launcher screen means a new
; installer.
;
; Two extra Start Menu entries stay for players who want to skip the launcher: "DB Revamped
; (Direct)" opens the AIR game on the game's address (the game has its own sign-in), and
; "DB Revamped (Classic Flash)" does the same in the Flash projector.

#define AppName "DB Revamped"
#define AppVersion "1.3.0"
#define AppPublisher "DB Revamped"
#define AppUrl "https://dungeonblitzv.duckdns.org"
; Plain http: the game reads its http files, which an https page may not.
#define GameUrl "http://dungeonblitzv.duckdns.org/p/cbp/DungeonBlitz.swf"

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
; The launcher: the HTA shell and its screen, loaded from here as a plain script.
Source: "..\DungeonBlitzR.hta"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\launcher-assets\ui.js"; DestDir: "{app}\launcher-assets"; Flags: ignoreversion
; The game in Adobe AIR's runtime (node air\build.js), up to 100 fps. The launcher's default engine.
Source: "..\air\bundle\*"; DestDir: "{app}\air"; Flags: ignoreversion recursesubdirs createallsubdirs
; Adobe's Flash Player 32 projector, as Adobe signed it (do not patch it: that breaks the signature).
Source: "..\flashplayer.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "db-revamped.ico"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; What earlier installers put here and this one does not: installer 1.1.1's starter exe (the one
; Defender called Bearfoos), the first installers' batch file, readme and icon. The HTA, ui.js and
; flashplayer.exe are overwritten by the files above (ignoreversion), so the signature-stripped
; projector of 1.1.x is replaced by Adobe's original either way.
Type: files; Name: "{app}\DB Revamped Launcher.exe"
Type: files; Name: "{app}\Play DB Revamped.bat"
Type: files; Name: "{app}\README.txt"
Type: files; Name: "{app}\app.ico"

[Icons]
; The launcher. mshta.exe is Windows' own; the shortcut's icon is ours, the taskbar shows mshta's.
Name: "{autoprograms}\{#AppName}"; Filename: "{sys}\mshta.exe"; Parameters: """{app}\DungeonBlitzR.hta"""; WorkingDir: "{app}"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped"
Name: "{autodesktop}\{#AppName}"; Filename: "{sys}\mshta.exe"; Parameters: """{app}\DungeonBlitzR.hta"""; WorkingDir: "{app}"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped"; Tasks: desktopicon
; Without the launcher: the game straight on its address, in AIR or in the Flash projector.
Name: "{autoprograms}\{#AppName} (Direct)"; Filename: "{app}\air\DB Revamped.exe"; Parameters: """{#GameUrl}"""; WorkingDir: "{app}\air"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped without the launcher (AIR)"
Name: "{autoprograms}\{#AppName} (Classic Flash)"; Filename: "{app}\flashplayer.exe"; Parameters: """{#GameUrl}"""; WorkingDir: "{app}"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped without the launcher, in Flash Player (uses less memory)"

; No "Start now" at the end: setup starting mshta was itself flagged by Defender
; (Behavior:Win32/Execution.A!ml, 2026-10-27). Players open the launcher from its shortcut.

[UninstallDelete]
; The remembered sign-in (a device token), the engine choice and the relaunch flags; uninstalling
; signs this PC out.
Type: filesandordirs; Name: "{userappdata}\DBRevamped"
