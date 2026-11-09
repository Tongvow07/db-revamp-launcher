; DB Revamped installer (Inno Setup 6).
;
; Build:  "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer\DBRevamped.iss
; Output: dist\DB Revamped Setup.exe
;
; Installs per user (no admin prompt) into %LOCALAPPDATA%\DB Revamped, with a Start Menu entry,
; an optional desktop shortcut and an entry in Settings > Apps for uninstalling.
;
; 1.4.8 (2026-11-08): the DB Tools menu is gone, and its painted sign is taken out of the background
;        (dbui\title.js toolsSign). Force close game now appears in the message shown when a game will not
;        close. The AIR engine downloads the live game file over https (the same file), so it cannot be
;        swapped on the player's network; the game keeps its http address for its own files. No new
;        program, nothing downloaded and run: same structure as 1.3.0 (Defender history below). A tray
;        icon was left out on purpose: an HTA cannot leave the taskbar while running, and a helper exe
;        is what Defender flagged in 1.1.1; revisit with a code-signing certificate.
;
; 1.4.7 (2026-11-07): Refresh always brings the game back. A game still open 6 s after its Refresh is ended
;        (our own game only, by its exact path), then Play is pressed again, retried every 3 s while the server
;        restarts (up to 5 minutes). DB Tools > Force close game ends a stuck game. A Refresh left while no launcher
;        was watching (in the last 10 minutes) starts the game as soon as the launcher opens and is signed in.
;
; 1.4.6 (2026-11-07): after Play the launcher steps out of sight and keeps watching while the game runs, so a
;        server restart always brings the game back as a fresh copy (an in-place reload kept the old copy,
;        300-650 MB a time, until the game crawled). It comes back on screen once the game is closed. Game detection fixed: the old check
;        (GetObject, undefined in the launcher page) never saw a running game.
;
; 1.4.5 (2026-11-05): a bigger panel (36% x 63% of the window) whose views sit in its middle, so Welcome Back
;        fits at full size.
;
; 1.4.4 (2026-11-05): the AIR engine opens in full screen at the screen's own size, or in a 1600x900 /
;        1280x720 window (launcher DISPLAY choice, screen.txt, dbScreen). Always drawn at the shown size,
;        so always sharp: no scaled-up (GPU-stretched) option. F11 / Alt+Enter switch in the game; Esc
;        stays the game's key. The AIR app downloads the game file without the one-time sign-in in its
;        address, so the file is cached between starts.
;
; 1.4.3 (2026-11-05): update notice. At start the launcher reads https://dbrevamped.com/download/launcher.json
;        ({"version":"x.y.z"}); when it is newer than LAUNCHER_VERSION in ui.js (kept equal to AppVersion
;        by dbui\build.js --verify), a gold UPDATE button opens the setup's download in the player's
;        browser. The launcher still downloads and runs nothing itself (Defender history below).
;        Releasing a launcher: upload the setup to download\DB-Revamped-Setup.exe, then set
;        download\launcher.json to its version. Setup skips its Ready page, so an update is two clicks.
;
; 1.4.2 (2026-11-05): a FRAME RATE choice under ENGINE (100 / 144 / 240 fps, AIR only), remembered in
;        %APPDATA%\DBRevamped\fps.txt and passed to the game as dbFps.
;
; 1.4.1 (2026-11-05): the title reads "DUNGEON BLITZ" (the game's banner face in the logo's colours, built
;        by dbui\title.js) over the painting's own gold "REVAMPED".
;
; 1.4.0 (2026-11-05): every launcher screen is built from the game's own UI art (launcher-assets\dbui, made by
;        dbui\build.js) with the game font, and the launcher talks to https://dbrevamped.com. Same
;        structure as 1.3.0: mshta runs only the installed ui.js; setup starts nothing.
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
#define AppVersion "1.5.0"
#define AppPublisher "DB Revamped"
#define AppUrl "https://dbrevamped.com"
; Plain http: the game reads its http files, which an https page may not.
#define GameUrl "http://dbrevamped.com/p/cbp/DungeonBlitz.swf"

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
DisableReadyPage=yes
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
; The DB UI kit the screen is made of: the game's own art, its UI font and dbui.css (node dbui\build.js).
; The title pieces (logo letters, stone) only build the title into ui.js's background (dbui\title.js).
Source: "..\launcher-assets\dbui\*.png"; DestDir: "{app}\launcher-assets\dbui"; Excludes: "logo-letter*.png,stone.png"; Flags: ignoreversion
Source: "..\launcher-assets\dbui\db-game-ui.*"; DestDir: "{app}\launcher-assets\dbui"; Flags: ignoreversion
Source: "..\launcher-assets\dbui\dbui.css"; DestDir: "{app}\launcher-assets\dbui"; Flags: ignoreversion
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
