package
{
   import flash.desktop.NativeApplication;
   import flash.display.Loader;
   import flash.display.Sprite;
   import flash.display.StageAlign;
   import flash.display.StageQuality;
   import flash.display.StageScaleMode;
   import flash.events.ErrorEvent;
   import flash.events.Event;
   import flash.events.IOErrorEvent;
   import flash.events.InvokeEvent;
   import flash.events.SecurityErrorEvent;
   import flash.events.UncaughtErrorEvent;
   import flash.net.URLLoader;
   import flash.net.URLLoaderDataFormat;
   import flash.net.URLRequest;
   import flash.system.ApplicationDomain;
   import flash.system.LoaderContext;
   import flash.text.TextField;
   import flash.text.TextFieldAutoSize;
   import flash.text.TextFormat;

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
      private var started:Boolean = false;
      private var status:TextField;
      private var page:String = "";

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
            status.text = "Start DB Revamped from its launcher.";
            return;
         }
         started = true;
         status.text = "Loading DB Revamped...";
         var download:URLLoader = new URLLoader();
         download.dataFormat = URLLoaderDataFormat.BINARY;
         download.addEventListener(Event.COMPLETE, onDownloaded);
         download.addEventListener(IOErrorEvent.IO_ERROR, onDownloadFailed);
         download.addEventListener(SecurityErrorEvent.SECURITY_ERROR, onDownloadFailed);
         download.load(new URLRequest(page));
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
