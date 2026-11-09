package dbrevamped.relay
{
   import flash.events.Event;
   import flash.events.IOErrorEvent;
   import flash.events.ProgressEvent;
   import flash.events.SecurityErrorEvent;
   import flash.events.ServerSocketConnectEvent;
   import flash.filesystem.File;
   import flash.filesystem.FileMode;
   import flash.filesystem.FileStream;
   import flash.net.ServerSocket;
   import flash.net.Socket;
   import flash.utils.ByteArray;

   /**
    * Relays for playing on another Dungeon Blitz server (Minesa or any address the launcher was
    * given), the way Arc Launcher does it (src/dps/relay.js there, MIT): every game server the client
    * talks to gets a relay on 127.0.0.1, the patched SWF (SwfLoginPatch) logs in through the first
    * one, and each "enter world" packet (0x21) is pointed at the relay for the server it names.
    *
    * The relay only reads the server's packets. Two matter here:
    *  - 0x21 enter world: its host and port are swapped for the relay's, everything else is copied.
    *  - 0x10 player data: the character's whole save. A copy is kept on this PC for the launcher's
    *    "transfer to DB Revamped" list (transfers\<server>\<name>.json in this app's storage folder,
    *    `dungeon-blitz-player-capture/1`, which the DB Revamped server decodes). Nothing is sent
    *    anywhere from here; the player sends it from the launcher, and the staff review it.
    * What the client sends goes to the server unread and unchanged.
    */
   public class ServerRelay
   {
      private static const PORT_FIRST:int = 13690;
      private static const PORT_LAST:int = 13989;
      private static const POLICY:String = '<?xml version="1.0"?><!DOCTYPE cross-domain-policy SYSTEM "/xml/dtds/cross-domain-policy.dtd">' +
         '<cross-domain-policy><site-control permitted-cross-domain-policies="master-only"/>' +
         '<allow-access-from domain="*" to-ports="*"/></cross-domain-policy>\u0000';
      /** Debug: trace every packet each way (adl only; set false for releases). */
      private static const TRACE_PACKETS:Boolean = false;
      private static const PLAYER_DATA:int = 0x10;
      private static const ENTER_WORLD:int = 0x21;
      /** Player data packets kept per character (newest last); the server uses the newest complete one. */
      private static const KEEP_PER_CHARACTER:int = 4;

      private var origin:String;
      private var nextPort:int = PORT_FIRST;
      private var relays:Object = {};
      /** Local port -> { host, port } of the server behind it. */
      private var targets:Object = {};
      /**
       * Every open game socket pair. AIR garbage-collects a Socket nothing holds on to, even while it is
       * connected (its listeners do not count), and the connection then dies with no event: 1.5.2 lost
       * the game connection a few seconds in, at the first collection. Pairs leave this list when they end.
       */
      private var live:Array = [];
      private var sockets:Array = [];
      private var connections:int = 0;
      private var kept:Object = {};

      /** origin: the other server's web address (http://host[:port]), written into each capture. */
      public function ServerRelay(origin:String)
      {
         this.origin = origin;
      }

      /** The local port that relays to host:port, made on first use. Throws when no port is free. */
      public function portFor(host:String, port:int) : int
      {
         var key:String = host.toLowerCase() + ":" + port;
         if (relays[key] !== undefined)
         {
            return int(relays[key]);
         }
         var listenPort:int = reserve();
         assign(listenPort, host, port);
         return listenPort;
      }

      /**
       * A listening local port with no server behind it yet: the login relay's port has to be in the
       * patched SWF before the login server is known for certain (assign it after SwfLoginPatch).
       */
      public function reserve() : int
      {
         while (nextPort <= PORT_LAST)
         {
            var listenPort:int = nextPort++;
            var server:ServerSocket = new ServerSocket();
            try
            {
               server.bind(listenPort, "127.0.0.1");
               server.listen();
            }
            catch (error:Error)
            {
               try { server.close(); } catch (ignored:Error) {}
               continue;
            }
            server.addEventListener(ServerSocketConnectEvent.CONNECT, accepter(listenPort));
            sockets.push(server);
            return listenPort;
         }
         throw new Error("no free local port between " + PORT_FIRST + " and " + PORT_LAST);
      }

      /** Points a reserved local port at host:port. */
      public function assign(listenPort:int, host:String, port:int) : void
      {
         var key:String = host.toLowerCase() + ":" + port;
         relays[key] = listenPort;
         targets[listenPort] = { host: host, port: port };
         trace("[ServerRelay] 127.0.0.1:" + listenPort + " -> " + key);
      }

      /** Stops every relay (the game is closing). */
      public function close() : void
      {
         for each (var server:ServerSocket in sockets)
         {
            try { server.close(); } catch (ignored:Error) {}
         }
         sockets = [];
      }

      private function isRelayPort(host:String, port:int) : Boolean
      {
         if (!/^(127\.|localhost$)/i.test(host))
         {
            return false;
         }
         for (var key:String in relays)
         {
            if (int(relays[key]) == port)
            {
               return true;
            }
         }
         return false;
      }

      private function accepter(listenPort:int) : Function
      {
         return function(event:ServerSocketConnectEvent) : void
         {
            var target:Object = targets[listenPort];
            if (!target)
            {
               event.socket.close();
               return;
            }
            pipe(event.socket, target.host, target.port);
         };
      }

      private function pipe(client:Socket, host:String, port:int) : void
      {
         var connection:int = ++connections;
         var upstream:Socket = new Socket();
         var pendingUp:ByteArray = new ByteArray();
         var down:ByteArray = new ByteArray();
         var firstChecked:Boolean = false;
         var upstreamOpen:Boolean = false;
         var closed:Boolean = false;
         var pair:Object = { client: client, upstream: upstream };
         live.push(pair);
         var stats:Object = { up: 0, down: 0, last: [] };
         stats.connection = connection;

         // Every way a relayed connection ends is traced (shown by adl; a no-op in the release player).
         var finishBy:Function = function(why:String) : Function
         {
            return function(... ignored) : void
            {
               trace("[ServerRelay] #" + connection + " " + host + ":" + port + " ended: " + why + "; bytes up " + stats.up + ", down " + stats.down + "; last packets down " + stats.last.join(" "));
               finish();
            };
         };
         var finish:Function = function(... ignored) : void
         {
            if (closed)
            {
               return;
            }
            closed = true;
            var at:int = live.indexOf(pair);
            if (at >= 0)
            {
               live.splice(at, 1);
            }
            try { if (upstream.connected) upstream.close(); } catch (e1:Error) {}
            try { if (client.connected) { client.flush(); client.close(); } } catch (e2:Error) {}
         };
         var toUpstream:Function = function(bytes:ByteArray) : void
         {
            if (!bytes.length)
            {
               return;
            }
            if (!upstreamOpen)
            {
               pendingUp.writeBytes(bytes);
               return;
            }
            upstream.writeBytes(bytes);
            upstream.flush();
         };
         client.addEventListener(ProgressEvent.SOCKET_DATA, function(event:ProgressEvent) : void
         {
            var chunk:ByteArray = new ByteArray();
            client.readBytes(chunk);
            if (!firstChecked)
            {
               firstChecked = true;
               // Flash asks for a socket policy before it opens a socket outside the app's sandbox.
               if (chunk.length && chunk[0] == 0x3c && chunk.toString().indexOf("<policy-file-request/>") == 0)
               {
                  client.writeUTFBytes(POLICY);
                  client.flush();
                  finish();
                  return;
               }
            }
            stats.up += chunk.length;
            if (TRACE_PACKETS)
            {
               if (!stats.upLog) stats.upLog = new ByteArray();
               stats.upLog.position = stats.upLog.length;
               stats.upLog.writeBytes(chunk);
               while (stats.upLog.length >= 4)
               {
                  var uid:int = (stats.upLog[0] << 8) | stats.upLog[1];
                  var ulen:int = (stats.upLog[2] << 8) | stats.upLog[3];
                  if (stats.upLog.length < 4 + ulen) break;
                  trace("[ServerRelay] #" + connection + " " + (new Date().time % 100000) + " UP 0x" + uid.toString(16) + "/" + ulen);
                  var urest:ByteArray = new ByteArray();
                  if (stats.upLog.length > 4 + ulen) urest.writeBytes(stats.upLog, 4 + ulen);
                  stats.upLog = urest;
               }
            }
            toUpstream(chunk);
         });
         client.addEventListener(Event.CLOSE, finishBy("the game closed it"));
         client.addEventListener(IOErrorEvent.IO_ERROR, finishBy("game-side socket error"));

         upstream.addEventListener(Event.CONNECT, function(event:Event) : void
         {
            upstreamOpen = true;
            if (pendingUp.length)
            {
               upstream.writeBytes(pendingUp);
               upstream.flush();
               pendingUp.clear();
            }
         });
         upstream.addEventListener(ProgressEvent.SOCKET_DATA, function(event:ProgressEvent) : void
         {
            down.position = down.length;
            var before:int = down.length;
            upstream.readBytes(down, down.length);
            stats.down += down.length - before;
            try
            {
               down = pump(down, client, connection, stats);
            }
            catch (error:Error)
            {
               trace("[ServerRelay] #" + connection + " forwarding failed: " + error.getStackTrace());
               finish();
            }
         });
         // The server closes after sending the client elsewhere: what was read still reaches the client.
         upstream.addEventListener(Event.CLOSE, function(event:Event) : void
         {
            if (down.length && client.connected)
            {
               client.writeBytes(down);
            }
            finishBy("the server closed it")();
         });
         upstream.addEventListener(IOErrorEvent.IO_ERROR, finishBy("server-side socket error"));
         upstream.addEventListener(SecurityErrorEvent.SECURITY_ERROR, finishBy("server-side security error"));
         upstream.connect(host, port);
      }

      /** Forwards every whole packet in `down` (rewriting 0x21, copying 0x10); returns what is left. */
      private function pump(down:ByteArray, client:Socket, connection:int, stats:Object) : ByteArray
      {
         var p:int = 0;
         var out:ByteArray = new ByteArray();
         while (down.length - p >= 4)
         {
            if (down[p] == 0x3c)
            {
               // Not a game packet: from here on everything passes as it is.
               out.writeBytes(down, p);
               p = down.length;
               break;
            }
            var id:int = (down[p] << 8) | down[p + 1];
            var len:int = (down[p + 2] << 8) | down[p + 3];
            if (down.length - p < 4 + len)
            {
               if (TRACE_PACKETS)
               {
                  trace("[ServerRelay] #" + connection + " waiting for 0x" + id.toString(16) + "/" + len + ", have " + (down.length - p - 4));
               }
               break;
            }
            var payload:ByteArray = new ByteArray();
            if (len)
            {
               payload.writeBytes(down, p + 4, len);
            }
            if (id == ENTER_WORLD)
            {
               var rewritten:ByteArray = redirect(payload);
               if (rewritten)
               {
                  payload = rewritten;
                  len = payload.length;
               }
            }
            else if (id == PLAYER_DATA)
            {
               keep(payload, connection);
            }
            stats.last.push("0x" + id.toString(16) + "/" + len);
            if (TRACE_PACKETS)
            {
               trace("[ServerRelay] #" + connection + " " + (new Date().time % 100000) + " DOWN 0x" + id.toString(16) + "/" + len);
            }
            if (stats.last.length > 12)
            {
               stats.last.shift();
            }
            out.writeByte(id >> 8);
            out.writeByte(id & 0xff);
            out.writeByte(len >> 8);
            out.writeByte(len & 0xff);
            out.writeBytes(payload);
            p += 4 + len;
         }
         if (out.length && client.connected)
         {
            client.writeBytes(out);
            client.flush();
         }
         var rest:ByteArray = new ByteArray();
         if (p < down.length)
         {
            rest.writeBytes(down, p);
         }
         return rest;
      }

      /** An enter-world payload pointed at the relay for the server it names, or null to pass it as it is. */
      private function redirect(payload:ByteArray) : ByteArray
      {
         try
         {
            var r:BitStream = new BitStream(payload);
            r.readUint(); // transfer token
            r.readUint(); // old level id
            r.readStr(); // old swf
            if (r.bool())
            {
               r.readUint();
               r.readUint();
            }
            var hostAt:int = r.bit;
            var host:String = r.readStr();
            var port:int = r.readUint();
            var restAt:int = r.bit;
            if (isRelayPort(host, port))
            {
               return null;
            }
            var local:int = portFor(host, port);
            var w:BitStream = new BitStream(new ByteArray());
            w.copy(payload, 0, hostAt);
            w.writeStr("127.0.0.1");
            w.writeUint(local);
            w.copy(payload, restAt, payload.length * 8 - restAt);
            trace("[ServerRelay] enter world " + host + ":" + port + " -> 127.0.0.1:" + local);
            return w.bytes;
         }
         catch (error:Error)
         {
            trace("[ServerRelay] enter world left as it is: " + error.message);
         }
         return null;
      }

      /** Keeps a player data packet for the launcher's transfer list. */
      private function keep(payload:ByteArray, connection:int) : void
      {
         try
         {
            var r:BitStream = new BitStream(payload);
            r.readUint(); // transfer token
            r.readUint(); // server time
            r.bits(2); // hp scaling
            r.readUint(); // bonus levels
            var name:String = r.readStr();
            if (!/^[A-Za-z0-9]{1,24}$/.test(name))
            {
               return;
            }
            var list:Array = kept[name] || (kept[name] = []);
            list.push({
               id: PLAYER_DATA,
               direction: "server-to-client",
               connection: connection,
               receivedAt: iso(new Date()),
               payloadBase64: base64(payload)
            });
            while (list.length > KEEP_PER_CHARACTER)
            {
               list.shift();
            }
            var capture:Object = {
               format: "dungeon-blitz-player-capture/1",
               source: {
                  origin: origin,
                  transport: "db-revamped-launcher-relay",
                  capturedAt: iso(new Date()),
                  client: "DB Revamped AIR",
                  protocolProfile: "db-r-local-2026-10-22"
               },
               character: { name: name },
               packets: list
            };
            var folder:File = File.applicationStorageDirectory.resolvePath("transfers/" + serverFolder());
            folder.createDirectory();
            var temp:File = folder.resolvePath(name + ".json.tmp");
            var stream:FileStream = new FileStream();
            stream.open(temp, FileMode.WRITE);
            stream.writeUTFBytes(JSON.stringify(capture));
            stream.close();
            temp.moveTo(folder.resolvePath(name + ".json"), true);
            trace("[ServerRelay] kept player data for " + name);
         }
         catch (error:Error)
         {
            trace("[ServerRelay] player data not kept: " + error.message);
         }
      }

      /** The other server's host name, safe as a folder name. */
      private function serverFolder() : String
      {
         var m:Array = /^https?:\/\/([^\/:?#]+)/i.exec(origin);
         return (m ? m[1] : "server").toLowerCase().replace(/[^a-z0-9.\-]/g, "_");
      }

      /** 2026-11-09T18:30:00.000Z, as the capture tool writes it. */
      private static function iso(d:Date) : String
      {
         var two:Function = function(v:int) : String { return (v < 10 ? "0" : "") + v; };
         var ms:String = String(1000 + d.millisecondsUTC).substr(1);
         return d.fullYearUTC + "-" + two(d.monthUTC + 1) + "-" + two(d.dateUTC) + "T" + two(d.hoursUTC) + ":" + two(d.minutesUTC) + ":" + two(d.secondsUTC) + "." + ms + "Z";
      }

      private static const B64:String = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

      private static function base64(b:ByteArray) : String
      {
         var out:Array = [];
         var i:int = 0;
         var n:int = b.length;
         while (i < n)
         {
            var c0:int = b[i];
            var c1:int = i + 1 < n ? b[i + 1] : 0;
            var c2:int = i + 2 < n ? b[i + 2] : 0;
            out.push(B64.charAt(c0 >> 2), B64.charAt(((c0 & 3) << 4) | (c1 >> 4)),
               i + 1 < n ? B64.charAt(((c1 & 15) << 2) | (c2 >> 6)) : "=",
               i + 2 < n ? B64.charAt(c2 & 63) : "=");
            i += 3;
         }
         return out.join("");
      }
   }
}
