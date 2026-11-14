package dbrevamped.relay
{
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.events.IOErrorEvent;
   import flash.events.ProgressEvent;
   import flash.events.SecurityErrorEvent;
   import flash.net.SecureSocket;
   import flash.net.Socket;
   import flash.utils.ByteArray;

   /**
    * 1.5.8: a game server reached through a WebSocket instead of its TCP port, for ServerRelay. Some
    * servers can only be reached that way: one run on someone's PC behind a web tunnel (a Cloudflare
    * quick tunnel carries web traffic only) gives its game the login address "localhost:<port>", and its
    * /web page tells Ruffle to send that address to a ws:// or wss:// URL instead (Ruffle's socketProxy).
    * This is the same thing for the AIR engine: every binary message is the bytes the game server wrote,
    * and every flush goes out as one binary message -- the stream the TCP game socket carries.
    *
    * It stands in for the upstream flash.net.Socket in ServerRelay.pipe: connect, writeBytes + flush,
    * readBytes, connected, close, and the same events (CONNECT once the WebSocket is open, SOCKET_DATA,
    * CLOSE, IO_ERROR, SECURITY_ERROR).
    */
   public class WebSocketUpstream extends EventDispatcher
   {
      private var url:String;
      private var secure:Boolean;
      private var host:String;
      private var port:int;
      private var path:String;
      private var origin:String;
      private var socket:Socket;
      private var open:Boolean = false;
      private var ended:Boolean = false;
      /** Bytes read from the socket and not yet parsed (the handshake reply, then frames). */
      private var inbound:ByteArray = new ByteArray();
      /** Game bytes taken out of messages, waiting for readBytes. */
      private var data:ByteArray = new ByteArray();
      /** Game bytes written since the last flush. */
      private var outbound:ByteArray = new ByteArray();
      /** A message arriving in several frames. */
      private var fragments:ByteArray = null;
      private var key:String;

      /** url: ws://host[:port]/path or wss://...; origin: the page's web address, sent as Origin. */
      public function WebSocketUpstream(url:String, origin:String)
      {
         var m:Array = /^(wss?):\/\/([^\/:?#]+)(?::(\d+))?([^#]*)$/i.exec(url);
         if (!m)
         {
            throw new Error("not a ws:// or wss:// address: " + url);
         }
         this.url = url;
         secure = String(m[1]).toLowerCase() == "wss";
         host = m[2];
         port = m[3] ? int(m[3]) : (secure ? 443 : 80);
         path = m[4] || "/";
         if (path.charAt(0) != "/")
         {
            path = "/" + path;
         }
         this.origin = origin;
      }

      /** ServerRelay checks before it picks this way: wss needs the runtime's TLS. */
      public static function canUse(url:String) : Boolean
      {
         return /^ws:\/\//i.test(url) || (/^wss:\/\//i.test(url) && SecureSocket.isSupported);
      }

      public function get connected() : Boolean
      {
         return open && !ended && socket != null && socket.connected;
      }

      /** host and port are the game's own address, which this WebSocket stands in for; they are not used. */
      public function connect(ignoredHost:String = null, ignoredPort:int = 0) : void
      {
         socket = secure ? new SecureSocket() : new Socket();
         socket.timeout = 15000;
         socket.addEventListener(Event.CONNECT, onConnect);
         socket.addEventListener(ProgressEvent.SOCKET_DATA, onData);
         socket.addEventListener(Event.CLOSE, onClose);
         socket.addEventListener(IOErrorEvent.IO_ERROR, onError);
         socket.addEventListener(SecurityErrorEvent.SECURITY_ERROR, onError);
         socket.connect(host, port);
      }

      public function writeBytes(bytes:ByteArray, offset:uint = 0, length:uint = 0) : void
      {
         outbound.position = outbound.length;
         outbound.writeBytes(bytes, offset, length);
      }

      /** Sends what was written since the last flush as one binary message. */
      public function flush() : void
      {
         if (!outbound.length || !connected)
         {
            return;
         }
         var payload:ByteArray = outbound;
         outbound = new ByteArray();
         send(0x2, payload);
      }

      /** Moves every game byte received so far into bytes, from offset (as Socket.readBytes with length 0). */
      public function readBytes(bytes:ByteArray, offset:uint = 0, length:uint = 0) : void
      {
         var n:uint = length && length < data.length ? length : data.length;
         bytes.position = offset;
         bytes.writeBytes(data, 0, n);
         var rest:ByteArray = new ByteArray();
         if (n < data.length)
         {
            rest.writeBytes(data, n);
         }
         data = rest;
      }

      public function get bytesAvailable() : uint
      {
         return data.length;
      }

      public function close() : void
      {
         if (ended)
         {
            return;
         }
         ended = true;
         try
         {
            if (open && socket.connected)
            {
               var code:ByteArray = new ByteArray();
               code.writeShort(1000);
               send(0x8, code);
            }
         }
         catch (ignored:Error) {}
         try { if (socket && socket.connected) socket.close(); } catch (ignored2:Error) {}
      }

      private function onConnect(event:Event) : void
      {
         var nonce:ByteArray = new ByteArray();
         for (var i:int = 0; i < 16; i++)
         {
            nonce.writeByte(int(Math.random() * 256));
         }
         key = base64(nonce);
         var defaultPort:Boolean = port == (secure ? 443 : 80);
         var request:String = "GET " + path + " HTTP/1.1\r\n" +
            "Host: " + host + (defaultPort ? "" : ":" + port) + "\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Key: " + key + "\r\n" +
            "Sec-WebSocket-Version: 13\r\n" +
            (origin ? "Origin: " + origin + "\r\n" : "") +
            "User-Agent: DB Revamped AIR\r\n" +
            "\r\n";
         socket.writeUTFBytes(request);
         socket.flush();
      }

      private function onData(event:ProgressEvent) : void
      {
         if (ended)
         {
            return;
         }
         inbound.position = inbound.length;
         socket.readBytes(inbound, inbound.length);
         if (!open)
         {
            var end:int = headerEnd(inbound);
            if (end < 0)
            {
               if (inbound.length > 16384)
               {
                  fail("the WebSocket server sent no handshake reply");
               }
               return;
            }
            inbound.position = 0;
            var head:String = inbound.readUTFBytes(end);
            var status:Array = /^HTTP\/1\.[01] (\d{3})/.exec(head);
            if (!status || status[1] != "101" || !/\r\nupgrade:\s*websocket/i.test(head))
            {
               fail("the WebSocket server refused the connection (" + (status ? "status " + status[1] : head.split("\r\n")[0]) + ")");
               return;
            }
            inbound = rest(inbound, end + 4);
            open = true;
            trace("[WebSocketUpstream] open: " + url);
            dispatchEvent(new Event(Event.CONNECT));
            if (ended)
            {
               return;
            }
         }
         parseFrames();
      }

      /** Takes every whole frame out of inbound; game bytes go to data, then one SOCKET_DATA. */
      private function parseFrames() : void
      {
         var before:uint = data.length;
         var p:int = 0;
         while (inbound.length - p >= 2)
         {
            var b0:int = inbound[p];
            var b1:int = inbound[p + 1];
            var fin:Boolean = (b0 & 0x80) != 0;
            var opcode:int = b0 & 0x0f;
            var masked:Boolean = (b1 & 0x80) != 0;
            var len:Number = b1 & 0x7f;
            var at:int = p + 2;
            if (len == 126)
            {
               if (inbound.length - at < 2) break;
               len = (inbound[at] << 8) | inbound[at + 1];
               at += 2;
            }
            else if (len == 127)
            {
               if (inbound.length - at < 8) break;
               if (inbound[at] | inbound[at + 1] | inbound[at + 2] | inbound[at + 3])
               {
                  fail("a WebSocket message over 4 GB");
                  return;
               }
               len = ((inbound[at + 4] << 24) >>> 0) + (inbound[at + 5] << 16) + (inbound[at + 6] << 8) + inbound[at + 7];
               at += 8;
            }
            var mask:Array = null;
            if (masked)
            {
               if (inbound.length - at < 4) break;
               mask = [inbound[at], inbound[at + 1], inbound[at + 2], inbound[at + 3]];
               at += 4;
            }
            if (inbound.length - at < len) break;
            var payload:ByteArray = new ByteArray();
            if (len)
            {
               payload.writeBytes(inbound, at, len);
            }
            if (mask)
            {
               for (var i:int = 0; i < payload.length; i++)
               {
                  payload[i] ^= mask[i & 3];
               }
            }
            p = at + len;
            if (opcode == 0x8)
            {
               inbound = new ByteArray();
               deliver(before);
               trace("[WebSocketUpstream] closed by the server: " + url);
               close();
               dispatchEvent(new Event(Event.CLOSE));
               return;
            }
            if (opcode == 0x9)
            {
               send(0xA, payload);
               continue;
            }
            if (opcode == 0xA)
            {
               continue;
            }
            // 0x1 text, 0x2 binary, 0x0 the rest of a message in parts: all of it is the game's stream.
            if (opcode == 0x0 || opcode == 0x1 || opcode == 0x2)
            {
               if (!fin)
               {
                  if (!fragments) fragments = new ByteArray();
                  fragments.writeBytes(payload);
                  continue;
               }
               if (fragments)
               {
                  fragments.writeBytes(payload);
                  payload = fragments;
                  fragments = null;
               }
               data.position = data.length;
               data.writeBytes(payload);
            }
         }
         inbound = rest(inbound, p);
         deliver(before);
      }

      private function deliver(before:uint) : void
      {
         if (data.length > before)
         {
            dispatchEvent(new ProgressEvent(ProgressEvent.SOCKET_DATA, false, false, data.length - before, 0));
         }
      }

      /** One frame from this client: masked, as RFC 6455 requires of clients. */
      private function send(opcode:int, payload:ByteArray) : void
      {
         var frame:ByteArray = new ByteArray();
         frame.writeByte(0x80 | opcode);
         var n:uint = payload.length;
         if (n < 126)
         {
            frame.writeByte(0x80 | n);
         }
         else if (n < 65536)
         {
            frame.writeByte(0x80 | 126);
            frame.writeShort(n);
         }
         else
         {
            frame.writeByte(0x80 | 127);
            frame.writeUnsignedInt(0);
            frame.writeUnsignedInt(n);
         }
         var mask:Array = [int(Math.random() * 256), int(Math.random() * 256), int(Math.random() * 256), int(Math.random() * 256)];
         for (var m:int = 0; m < 4; m++)
         {
            frame.writeByte(mask[m]);
         }
         var start:uint = frame.length;
         frame.writeBytes(payload);
         for (var i:uint = 0; i < n; i++)
         {
            frame[start + i] ^= mask[i & 3];
         }
         socket.writeBytes(frame);
         socket.flush();
      }

      private function onClose(event:Event) : void
      {
         if (ended)
         {
            return;
         }
         ended = true;
         dispatchEvent(new Event(Event.CLOSE));
      }

      private function onError(event:Event) : void
      {
         if (ended)
         {
            return;
         }
         ended = true;
         var text:String = event is IOErrorEvent ? IOErrorEvent(event).text : (event is SecurityErrorEvent ? SecurityErrorEvent(event).text : "");
         trace("[WebSocketUpstream] " + url + ": " + text);
         if (event is SecurityErrorEvent)
         {
            dispatchEvent(new SecurityErrorEvent(SecurityErrorEvent.SECURITY_ERROR, false, false, text));
         }
         else
         {
            dispatchEvent(new IOErrorEvent(IOErrorEvent.IO_ERROR, false, false, text));
         }
      }

      private function fail(why:String) : void
      {
         trace("[WebSocketUpstream] " + url + ": " + why);
         var wasEnded:Boolean = ended;
         ended = true;
         try { if (socket && socket.connected) socket.close(); } catch (ignored:Error) {}
         if (!wasEnded)
         {
            dispatchEvent(new IOErrorEvent(IOErrorEvent.IO_ERROR, false, false, why));
         }
      }

      private static function headerEnd(b:ByteArray) : int
      {
         for (var i:int = 0; i + 3 < b.length; i++)
         {
            if (b[i] == 13 && b[i + 1] == 10 && b[i + 2] == 13 && b[i + 3] == 10)
            {
               return i;
            }
         }
         return -1;
      }

      private static function rest(b:ByteArray, from:int) : ByteArray
      {
         var out:ByteArray = new ByteArray();
         if (from < b.length)
         {
            out.writeBytes(b, from);
         }
         return out;
      }

      private static const B64:String = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

      private static function base64(b:ByteArray) : String
      {
         var out:Array = [];
         for (var i:int = 0; i < b.length; i += 3)
         {
            var c0:int = b[i];
            var c1:int = i + 1 < b.length ? b[i + 1] : 0;
            var c2:int = i + 2 < b.length ? b[i + 2] : 0;
            out.push(B64.charAt(c0 >> 2), B64.charAt(((c0 & 3) << 4) | (c1 >> 4)),
               i + 1 < b.length ? B64.charAt(((c1 & 15) << 2) | (c2 >> 6)) : "=",
               i + 2 < b.length ? B64.charAt(c2 & 63) : "=");
         }
         return out.join("");
      }
   }
}
