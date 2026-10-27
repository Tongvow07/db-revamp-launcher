; DB Revamped installer (Inno Setup 6).
;
; Build:  "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer\DBRevamped.iss
; Output: dist\DB Revamped Setup.exe
;
; Installs per user (no admin prompt) into %LOCALAPPDATA%\DB Revamped, with a Start Menu entry,
; an optional desktop shortcut and an entry in Settings > Apps for uninstalling.
;
; The shortcuts open the game directly: the AIR app (air\DB Revamped.exe) on the game's address.
; The game has its own sign-in, registration and account switch, and remembers the sign-in. The
; server redirects the plain address to the current client revision without caching, so every
; start loads the current game.
;
; From 1.2.0 there is no launcher window. The old one was an HTA run by Windows' mshta.exe, which
; downloaded its screen and ran it; Windows Defender took that for a trojan loader on players' PCs
; (Trojan:Win32/Bearfoos.B!ml, Behavior:Win32/Execution.A!ml, 2026-10-27). Nothing here runs a
; script host, and setup starts nothing when it finishes.
;
; 1.2.1: a second shortcut, "DB Revamped (Classic Flash)", for PCs where AIR runs short of memory
; (Flash uses about 0.4-0.5 GB less). It is Adobe's own Flash Player 32 projector, unmodified and
; validly signed: earlier installers shipped it with the 4 GB patch, which strips Adobe's signature
; and reads as a tampered file.

#define AppName "DB Revamped"
#define AppVersion "1.2.1"
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
Name: "flashdesktop"; Description: "Also a desktop shortcut for Classic &Flash (for low-end PCs)"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
; The game in Adobe AIR's runtime (node air\build.js), up to 100 fps.
Source: "..\air\bundle\*"; DestDir: "{app}\air"; Flags: ignoreversion recursesubdirs createallsubdirs
; Adobe's Flash Player 32 projector, as Adobe signed it (do not patch it: that breaks the signature).
Source: "..\flashplayer.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "db-revamped.ico"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; What earlier installers put here: the mshta launcher, its screen, its 1.1.1 starter, the
; signature-stripped Flash projector (replaced by Adobe's original above), and the old batch file
; and readme.
Type: files; Name: "{app}\DungeonBlitzR.hta"
Type: files; Name: "{app}\DB Revamped Launcher.exe"
Type: files; Name: "{app}\flashplayer.exe"
Type: files; Name: "{app}\Play DB Revamped.bat"
Type: files; Name: "{app}\README.txt"
Type: files; Name: "{app}\app.ico"
Type: filesandordirs; Name: "{app}\launcher-assets"

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\air\DB Revamped.exe"; Parameters: """{#GameUrl}"""; WorkingDir: "{app}\air"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\air\DB Revamped.exe"; Parameters: """{#GameUrl}"""; WorkingDir: "{app}\air"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped"; Tasks: desktopicon
Name: "{autoprograms}\{#AppName} (Classic Flash)"; Filename: "{app}\flashplayer.exe"; Parameters: """{#GameUrl}"""; WorkingDir: "{app}"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped in Flash Player (uses less memory)"
Name: "{autodesktop}\{#AppName} (Classic Flash)"; Filename: "{app}\flashplayer.exe"; Parameters: """{#GameUrl}"""; WorkingDir: "{app}"; IconFilename: "{app}\db-revamped.ico"; Comment: "Play DB Revamped in Flash Player (uses less memory)"; Tasks: flashdesktop

[UninstallDelete]
; The old launcher's remembered sign-in, if any.
Type: filesandordirs; Name: "{userappdata}\DBRevamped"
