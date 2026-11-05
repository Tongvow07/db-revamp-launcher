package
{
   import flash.desktop.NativeApplication;
   import flash.display.Loader;
   import flash.display.NativeWindow;
   import flash.display.Screen;
   import flash.display.Sprite;
   import flash.display.StageDisplayState;
   import flash.display.StageAlign;
   import flash.display.StageQuality;
   import flash.display.StageScaleMode;
   import flash.events.ErrorEvent;
   import flash.events.Event;
   import flash.events.IOErrorEvent;
   import flash.events.InvokeEvent;
   import flash.events.KeyboardEvent;
   import flash.events.SecurityErrorEvent;
   import flash.events.UncaughtErrorEvent;
   import flash.geom.Rectangle;
   import flash.net.URLLoader;
   import flash.net.URLLoaderDataFormat;
   import flash.net.URLRequest;
   import flash.system.ApplicationDomain;
   import flash.system.LoaderContext;
   import flash.text.TextField;
   import flash.text.TextFieldAutoSize;
   import flash.text.TextFormat;
   import flash.ui.Keyboard;

   /**
    * DB Revamped in Adobe AIR's runtime instead of the Flash Player 32 projector.
    *
    * Started as `DB Revamped.exe <DungeonBlitz.swf URL with its query>`, the way the launcher starts
    * flashplayer.exe. The SWF is downloaded and run from its bytes, so the game shares this app's
    * security sandbox and may use the stage. Its flashvars are the URL's query, plus `dbPage`, the
    * URL itself: the game's AirCompat class reads it wherever the game used to read its own
    * address from `loaderInfo.url`, which under AIR is this app's.
    */
   [SWF(width="1152", height="768", backgroundColor="#000000", frameRate="60")]
   public class DBRevampedAir extends Sprite
   {
      /** What the app opens when started without a game URL (installer\DBRevamped.iss GameUrl). */
      private static const LIVE_GAME:String = "http://dbrevamped.com/p/cbp/DungeonBlitz.swf?fv=cbp&gv=cbp";

      private var started:Boolean = false;
      private var status:TextField;
      private var page:String = "";
      /** dbScreen=WxH: the window's game area when not in full screen; 0 for a maximised window. */
      private var windowWidth:int = 0;
      private var windowHeight:int = 0;
      private var toggleHeld:Boolean = false;

      public function DBRevampedAir()
      {
         stage.scaleMode = StageScaleMode.NO_SCALE;
         stage.align = StageAlign.TOP_LEFT;
         stage.quality = StageQuality.HIGH;
         if (stage.nativeWindow)
         {
            // The window's chrome goes around the game's 1152x768.
            stage.nativeWindow.width += 1152 - stage.stageWidth;
            stage.nativeWindow.height += 768 - stage.stageHeight;
         }
         status = new TextField();
         status.defaultTextFormat = new TextFormat("_sans", 16, 0xF8F2EA);
         status.autoSize = TextFieldAutoSize.LEFT;
         status.x = 24;
         status.y = 24;
         addChild(status);
         NativeApplication.nativeApplication.addEventListener(InvokeEvent.INVOKE, onInvoke);
      }

      private function onInvoke(event:InvokeEvent) : void
      {
         if (started)
         {
            return;
         }
         for each (var arg:String in event.arguments)
         {
            if (/^https?:\/\//i.test(arg))
            {
               page = arg;
            }
         }
         if (!page)
         {
            // Opened on its own (the Mac app has no launcher): the live game, which signs in on
            // its own login screen the way the web page does.
            page = LIVE_GAME;
         }
         started = true;
         screenStart(flashvars(page));
         status.text = "Loading DB Revamped...";
         var download:URLLoader = new URLLoader();
         download.dataFormat = URLLoaderDataFormat.BINARY;
         download.addEventListener(Event.COMPLETE, onDownloaded);
         download.addEventListener(IOErrorEvent.IO_ERROR, onDownloadFailed);
         download.addEventListener(SecurityErrorEvent.SECURITY_ERROR, onDownloadFailed);
         download.load(new URLRequest(gameFileUrl(page)));
      }

      /**
       * The game file's address without the launcher's one-time sign-in (dbLaunchEmail, dbLaunchCode):
       * with it, every start was a new address and downloaded the whole file again; without it, the
       * file comes from the cache once the server says it is unchanged. The game still gets the
       * sign-in, from the flashvars (flashvars(page)).
       */
      private static function gameFileUrl(url:String) : String
      {
         var query:int = url.indexOf("?");
         if (query < 0)
         {
            return url;
         }
         var kept:Array = [];
         for each (var pair:String in url.substr(query + 1).split("#")[0].split("&"))
         {
            if (pair && !/^dbLaunch(Email|Code)=/i.test(pair))
            {
               kept.push(pair);
            }
         }
         return url.substr(0, query) + (kept.length ? "?" + kept.join("&") : "");
      }

      /**
       * The screen: full screen at the screen's own size by default, always drawn sharp (no scaled-up
       * picture). dbScreen=WxH opens a window with a WxH game area instead, centred and kept on screen.
       * F11 or Alt+Enter switches between full screen and the window (maximised when none was chosen).
       * Esc stays the game's own key (chat, menus): AIR would leave full screen on it, so its default
       * is cancelled while in full screen.
       */
      private function screenStart(vars:Object) : void
      {
         var size:Array = /^(\d{3,4})x(\d{3,4})$/.exec(String(vars.dbScreen || ""));
         if (size && int(size[1]) >= 1024 && int(size[2]) >= 576)
         {
            windowWidth = int(size[1]);
            windowHeight = int(size[2]);
         }
         stage.addEventListener(KeyboardEvent.KEY_DOWN, onScreenKey, true, int.MAX_VALUE);
         stage.addEventListener(KeyboardEvent.KEY_DOWN, onScreenKey, false, int.MAX_VALUE);
         stage.addEventListener(KeyboardEvent.KEY_UP, onScreenKeyUp, true, int.MAX_VALUE);
         stage.addEventListener(KeyboardEvent.KEY_UP, onScreenKeyUp, false, int.MAX_VALUE);
         setFullScreen(windowWidth == 0);
         if (stage.nativeWindow)
         {
            stage.nativeWindow.activate();
         }
      }

      private function setFullScreen(on:Boolean) : void
      {
         try
         {
            stage.fullScreenSourceRect = null;
            stage.displayState = on ? StageDisplayState.FULL_SCREEN_INTERACTIVE : StageDisplayState.NORMAL;
            if (!on)
            {
               placeWindow();
            }
         }
         catch (error:Error)
         {
            trace("[DBRevampedAir] screen: " + error.message);
         }
      }

      /** The chosen window size, centred on the screen it is on and never larger than its free area; else maximised. */
      private function placeWindow() : void
      {
         var window:NativeWindow = stage.nativeWindow;
         if (!window)
         {
            return;
         }
         if (windowWidth == 0)
         {
            window.maximize();
            return;
         }
         window.restore();
         var screens:Array = Screen.getScreensForRectangle(window.bounds);
         var free:Rectangle = Screen(screens.length ? screens[0] : Screen.mainScreen).visibleBounds;
         var chromeWidth:Number = window.width - stage.stageWidth;
         var chromeHeight:Number = window.height - stage.stageHeight;
         var width:Number = Math.min(windowWidth + chromeWidth, free.width);
         var height:Number = Math.min(windowHeight + chromeHeight, free.height);
         window.bounds = new Rectangle(
            Math.round(free.x + (free.width - width) / 2),
            Math.round(free.y + (free.height - height) / 2),
            width,
            height);
      }

      private function onScreenKey(event:KeyboardEvent) : void
      {
         if (event.keyCode == Keyboard.ESCAPE)
         {
            if (stage.displayState != StageDisplayState.NORMAL)
            {
               event.preventDefault();
            }
            return;
         }
         if (event.keyCode == Keyboard.F11 || (event.keyCode == Keyboard.ENTER && event.altKey))
         {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!toggleHeld)
            {
               toggleHeld = true;
               setFullScreen(stage.displayState == StageDisplayState.NORMAL);
            }
         }
      }

      private function onScreenKeyUp(event:KeyboardEvent) : void
      {
         if (event.keyCode == Keyboard.F11 || event.keyCode == Keyboard.ENTER)
         {
            toggleHeld = false;
         }
      }

      private function onDownloadFailed(event:ErrorEvent) : void
      {
         started = false;
         status.text = "Could not download the game.\n" + event.text;
      }

      private function onDownloaded(event:Event) : void
      {
         var context:LoaderContext = new LoaderContext(false, new ApplicationDomain(ApplicationDomain.currentDomain));
         context.allowCodeImport = true;
         context.parameters = flashvars(page);
         var loader:Loader = new Loader();
         // Flash Player's release build shows nothing for an error the game leaves uncaught.
         loader.uncaughtErrorEvents.addEventListener(UncaughtErrorEvent.UNCAUGHT_ERROR, onUncaught);
         removeChild(status);
         addChild(loader);
         loader.loadBytes(URLLoader(event.target).data, context);
      }

      private function onUncaught(event:UncaughtErrorEvent) : void
      {
         event.preventDefault();
         var error:Error = event.error as Error;
         trace("[DBRevampedAir] uncaught: " + (error ? (error.getStackTrace() || error.message) : String(event.error)));
      }

      private static function flashvars(url:String) : Object
      {
         var vars:Object = { dbPage: url };
         var query:int = url.indexOf("?");
         if (query < 0)
         {
            return vars;
         }
         for each (var pair:String in url.substr(query + 1).split("#")[0].split("&"))
         {
            var eq:int = pair.indexOf("=");
            var key:String = decodeURIComponent(eq < 0 ? pair : pair.substr(0, eq));
            if (key && key != "dbPage")
            {
               vars[key] = eq < 0 ? "" : decodeURIComponent(pair.substr(eq + 1).replace(/\+/g, " "));
            }
         }
         return vars;
      }
   }
}
