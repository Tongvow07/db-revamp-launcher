package dbrevamped.relay
{
   import flash.desktop.NativeProcess;
   import flash.desktop.NativeProcessStartupInfo;
   import flash.events.NativeProcessExitEvent;
   import flash.filesystem.File;
   import flash.filesystem.FileMode;
   import flash.filesystem.FileStream;

   /**
    * 1.5.9: DB Online, played through this app's relay so its characters can be offered for transfer,
    * the way Arc Launcher does it (app/online.js there, MIT), on DB Online's current routes.
    *
    * DB Online's own launcher (installed from dungeonblitz.online) is used as it is: its login core signs
    * the player in with its device check, which nothing here reproduces. This only:
    *  - copies the installed launcher into this app's storage (its uninstaller left out);
    *  - points the copy's server.txt at a login relay on 127.0.0.1. Given a local server, DB Online's core
    *    still forwards the login with its device frame from its own port 8443, and leaves the game port
    *    (7498) to us;
    *  - relays both to DB Online through its own WebSocket route (ws://content.dungeonblitz.online/ws/
    *    login and /ws/game, what its launcher falls back to when the game server's ports cannot be
    *    reached), keeping each character's player data for "transfer to DB Revamped" (ServerRelay);
    *  - starts the copy, and ends the relays when it closes.
    * Nothing about the player's account is read or stored here beyond what ServerRelay keeps.
    *
    * DB Online's routes, from its launcher core of 2026-11-12: game server 95.217.154.174 (ports 4443
    * and 7498, which may be firewalled for players), and the WebSocket route on content.dungeonblitz.online.
    */
   public class DboSession
   {
      public static const ORIGIN:String = "https://dungeonblitz.online";
      public static const PROFILE:String = "db-online-2026-10-25";
      private static const SERVER:String = "95.217.154.174";
      private static const LOGIN_PORT:int = 4443;
      private static const GAME_PORT:int = 7498;
      private static const CONTENT:String = "https://content.dungeonblitz.online";
      /**
       * Plain ws on port 80, as DB Online's own launcher does (its WS_PORTS 80, 8880, 2052 behind
       * Cloudflare): AIR's SecureSocket cannot open TLS to that host (Socket Error #2031, 2026-11-16),
       * the reason DB Online's launcher does not use wss either. The game traffic is the same either way.
       */
      private static const WS:String = "ws://content.dungeonblitz.online/ws/";

      private var source:File;
      private var relay:ServerRelay;
      private var process:NativeProcess;
      private var saved:Array = [];

      /** source: DB Online's install folder (the one with DungeonBlitz.exe and server.txt). */
      public function DboSession(source:File)
      {
         this.source = source;
      }

      /** The usual install folder for this Windows user. */
      public static function defaultInstall() : File
      {
         return File.userDirectory.resolvePath("AppData/Local/Programs/Dungeon Blitz");
      }

      /**
       * Starts DB Online through the relay. status(text) is told what is happening and each character
       * saved; ended() is called when DB Online closes. Throws with a message for the player when it
       * cannot start.
       */
      public function start(status:Function, ended:Function) : void
      {
         if (!source.resolvePath("DungeonBlitz.exe").exists)
         {
            throw new Error("DB Online is not installed. Install its launcher from dungeonblitz.online first: it signs players in with its own device check.");
         }
         if (!NativeProcess.isSupported)
         {
            throw new Error("This copy of the game app cannot start other programs, so it cannot open DB Online.");
         }
         var runtime:File = File.applicationStorageDirectory.resolvePath("dbo-runtime");
         copyInstall(source, runtime);

         relay = new ServerRelay(ORIGIN);
         relay.protocolProfile = PROFILE;
         relay.forceWebSocket = true;
         relay.fixedEnterWorld = GAME_PORT;
         relay.onKept = function(name:String) : void
         {
            if (saved.indexOf(name) < 0)
            {
               saved.push(name);
            }
            status("Saved for transfer: " + saved.join(", "));
         };
         var loginPort:int = relay.reserve();
         relay.assign(loginPort, SERVER, LOGIN_PORT);
         relay.webSocketFor(SERVER, LOGIN_PORT, WS + "login");
         if (!relay.listenOn(GAME_PORT))
         {
            relay.close();
            throw new Error("Close DB Online first: its game port (" + GAME_PORT + ") is already in use.");
         }
         relay.assign(GAME_PORT, SERVER, GAME_PORT);
         relay.webSocketFor(SERVER, GAME_PORT, WS + "game");

         var serverTxt:FileStream = new FileStream();
         serverTxt.open(runtime.resolvePath("server.txt"), FileMode.WRITE);
         serverTxt.writeUTFBytes("127.0.0.1:" + loginPort + "\ncontent=" + CONTENT + "\n");
         serverTxt.close();

         var info:NativeProcessStartupInfo = new NativeProcessStartupInfo();
         info.executable = runtime.resolvePath("DungeonBlitz.exe");
         info.workingDirectory = runtime;
         process = new NativeProcess();
         process.addEventListener(NativeProcessExitEvent.EXIT, function(event:NativeProcessExitEvent) : void
         {
            stop();
            ended();
         });
         process.start(info);
         status("DB Online is open in its own window. Sign in there and enter the world with each character you want to transfer.");
      }

      public function stop() : void
      {
         if (relay)
         {
            relay.close();
            relay = null;
         }
      }

      /** The names saved so far. */
      public function get savedNames() : Array
      {
         return saved.concat();
      }

      /** Copies the install, file by file, leaving out the uninstaller (as Arc does). */
      private static function copyInstall(from:File, to:File) : void
      {
         to.createDirectory();
         for each (var entry:File in from.getDirectoryListing())
         {
            if (/^uninstall/i.test(entry.name) || entry.isSymbolicLink)
            {
               continue;
            }
            var target:File = to.resolvePath(entry.name);
            if (entry.isDirectory)
            {
               copyInstall(entry, target);
            }
            else
            {
               entry.copyTo(target, true);
            }
         }
      }
   }
}
