package
{
   import flash.utils.ByteArray;
   import flash.utils.Endian;

   /**
    * Points another server's DungeonBlitz.swf at the relay on this computer (ServerRelay), the way
    * Arc Launcher does (src/dps/swfpatch.js there, MIT): the client logs in to a host and port set
    * in two class initialisers,
    *
    *   LinkUpdater:  findproperty const_1264;       pushstring "<login host>"; initproperty const_1264
    *   Connection:   findproperty LOGINSERVER_PORT; pushshort <login port>;    initproperty LOGINSERVER_PORT
    *
    * and those two operands are swapped for "127.0.0.1" and the relay's port. Each new operand takes
    * exactly as many bytes as the old one, so no method body changes length; only the string pool
    * grows by one string when "127.0.0.1" is not in it yet. Every later server comes from packet
    * 0x21, which the relay rewrites. Used only for servers other than DB Revamped: our own game
    * connects straight to our server.
    */
   public class SwfLoginPatch
   {
      private static const FINDPROPSTRICT:int = 0x5d;
      private static const FINDPROPERTY:int = 0x5e;
      private static const PUSHSTRING:int = 0x2c;
      private static const PUSHSHORT:int = 0x25;
      private static const INITPROPERTY:int = 0x68;
      private static const SETPROPERTY:int = 0x61;

      /** The login host and port read from the SWF (set by patch, also when it fails). */
      public var originalHost:String = "";
      public var originalPort:int = 0;
      public var hostPatches:int = 0;
      public var portPatches:int = 0;

      /**
       * The SWF with its login pointed at host:port, uncompressed (FWS), or null when the login
       * address could not be found exactly once each.
       */
      public function patch(swf:ByteArray, host:String, port:int) : ByteArray
      {
         if (port <= 0 || port >= 16384)
         {
            throw new Error("the relay port must be below 16384 (it replaces a two-byte operand)");
         }
         var sig:String = String.fromCharCode(swf[0], swf[1], swf[2]);
         if (sig != "CWS" && sig != "FWS")
         {
            throw new Error("not a zlib or uncompressed SWF (" + sig + ")");
         }
         var version:int = swf[3];
         var body:ByteArray = new ByteArray();
         body.writeBytes(swf, 8);
         if (sig == "CWS")
         {
            body.uncompress();
         }
         body.endian = Endian.LITTLE_ENDIAN;
         var nbits:int = body[0] >> 3;
         var p:int = Math.ceil((5 + nbits * 4) / 8) + 4;
         var out:ByteArray = new ByteArray();
         out.endian = Endian.LITTLE_ENDIAN;
         out.writeBytes(body, 0, p);
         while (p < body.length)
         {
            body.position = p;
            var h:int = body.readUnsignedShort();
            var code:int = h >> 6;
            var len:int = h & 0x3f;
            var hl:int = 2;
            if (len == 0x3f)
            {
               len = body.readUnsignedInt();
               hl = 6;
            }
            var replaced:Boolean = false;
            if (code == 82 || code == 72)
            {
               var abcAt:int = 0;
               if (code == 82)
               {
                  abcAt = 4;
                  while (body[p + hl + abcAt] != 0)
                  {
                     abcAt++;
                  }
                  abcAt++;
               }
               var abc:ByteArray = new ByteArray();
               abc.writeBytes(body, p + hl + abcAt, len - abcAt);
               var patched:ByteArray = patchAbc(abc, host, port);
               if (patched)
               {
                  out.writeShort((code << 6) | 0x3f);
                  out.writeUnsignedInt(abcAt + patched.length);
                  out.writeBytes(body, p + hl, abcAt);
                  out.writeBytes(patched);
                  replaced = true;
               }
            }
            if (!replaced)
            {
               out.writeBytes(body, p, hl + len);
            }
            p += hl + len;
            if (code == 0)
            {
               break;
            }
         }
         if (hostPatches < 1 || portPatches != 1)
         {
            return null;
         }
         var result:ByteArray = new ByteArray();
         result.endian = Endian.LITTLE_ENDIAN;
         result.writeUTFBytes("FWS");
         result.writeByte(version);
         result.writeUnsignedInt(out.length + 8);
         result.writeBytes(out);
         result.position = 0;
         return result;
      }

      private function patchAbc(abc:ByteArray, host:String, port:int) : ByteArray
      {
         var pool:Object = readPool(abc);
         var hostHits:Array = findAssignments(abc, multinamesNamed(abc, pool, "const_1264"), PUSHSTRING);
         var portHits:Array = findAssignments(abc, multinamesNamed(abc, pool, "LOGINSERVER_PORT"), PUSHSHORT);
         if (!hostHits.length || !portHits.length)
         {
            return null;
         }
         originalHost = pool.strings[hostHits[0].value] || "";
         originalPort = portHits[0].value & 0xffff;
         var hostIndex:int = (pool.strings as Array).indexOf(host);
         if (hostIndex < 0)
         {
            abc = appendString(abc, pool, host);
            hostIndex = pool.stringCount;
            pool = readPool(abc);
            hostHits = findAssignments(abc, multinamesNamed(abc, pool, "const_1264"), PUSHSTRING);
            portHits = findAssignments(abc, multinamesNamed(abc, pool, "LOGINSERVER_PORT"), PUSHSHORT);
         }
         var hit:Object;
         for each (hit in hostHits)
         {
            if (u30Size(hostIndex) > hit.len)
            {
               throw new Error("the relay host does not fit the original operand");
            }
            writeU30(abc, hit.at, hostIndex, hit.len);
            hostPatches++;
         }
         for each (hit in portHits)
         {
            writeU30(abc, hit.at, port, hit.len);
            portPatches++;
         }
         return abc;
      }

      // ---- the ABC constant pool -------------------------------------------------------------

      private static function readU30(b:ByteArray, o:int) : Object
      {
         var v:Number = 0;
         var n:int = 0;
         while (true)
         {
            var c:int = b[o + n];
            v += (c & 0x7f) * Math.pow(2, 7 * n);
            n++;
            if (!(c & 0x80) || n >= 5)
            {
               break;
            }
         }
         return { v: v, n: n };
      }

      private static function u30Bytes(v:Number, len:int) : Array
      {
         var out:Array = [];
         var x:Number = v;
         do
         {
            out.push(x & 0x7f);
            x = Math.floor(x / 128);
         }
         while (x > 0);
         while (out.length < len)
         {
            out.push(0);
         }
         for (var i:int = 0; i < out.length - 1; i++)
         {
            out[i] |= 0x80;
         }
         return out;
      }

      private static function u30Size(v:Number) : int
      {
         return u30Bytes(v, 0).length;
      }

      private static function writeU30(b:ByteArray, at:int, v:Number, len:int) : void
      {
         var bytes:Array = u30Bytes(v, len);
         for (var i:int = 0; i < bytes.length; i++)
         {
            b[at + i] = bytes[i];
         }
      }

      private static function readPool(abc:ByteArray) : Object
      {
         var q:int = 4;
         var r:Object;
         var i:int;
         var count:Object = readU30(abc, q); // ints
         q += count.n;
         for (i = 1; i < count.v; i++) { q += readU30(abc, q).n; }
         count = readU30(abc, q); // uints
         q += count.n;
         for (i = 1; i < count.v; i++) { q += readU30(abc, q).n; }
         count = readU30(abc, q); // doubles
         q += count.n + 8 * Math.max(0, count.v - 1);
         var stringCountAt:int = q;
         count = readU30(abc, q);
         q += count.n;
         var strings:Array = [""];
         for (i = 1; i < count.v; i++)
         {
            r = readU30(abc, q);
            q += r.n;
            abc.position = q;
            strings.push(abc.readUTFBytes(r.v));
            q += r.v;
         }
         return { strings: strings, stringCountAt: stringCountAt, stringCount: count.v, stringsEnd: q };
      }

      /** Indexes of the QName multinames whose name is `name`. */
      private static function multinamesNamed(abc:ByteArray, pool:Object, name:String) : Array
      {
         var idx:int = (pool.strings as Array).indexOf(name);
         var out:Array = [];
         if (idx < 0)
         {
            return out;
         }
         var q:int = pool.stringsEnd;
         var r:Object;
         var i:int;
         var k:int;
         var c:Object = readU30(abc, q); // namespaces
         q += c.n;
         for (i = 1; i < c.v; i++) { q += 1; q += readU30(abc, q).n; }
         c = readU30(abc, q); // namespace sets
         q += c.n;
         for (i = 1; i < c.v; i++)
         {
            r = readU30(abc, q);
            q += r.n;
            for (k = 0; k < r.v; k++) { q += readU30(abc, q).n; }
         }
         c = readU30(abc, q); // multinames
         q += c.n;
         for (i = 1; i < c.v; i++)
         {
            var kind:int = abc[q++];
            var nm:int = -1;
            if (kind == 0x07 || kind == 0x0d)
            {
               q += readU30(abc, q).n;
               r = readU30(abc, q); q += r.n; nm = r.v;
            }
            else if (kind == 0x0f || kind == 0x10)
            {
               r = readU30(abc, q); q += r.n; nm = r.v;
            }
            else if (kind == 0x09 || kind == 0x0e)
            {
               r = readU30(abc, q); q += r.n; nm = r.v;
               q += readU30(abc, q).n;
            }
            else if (kind == 0x1b || kind == 0x1c)
            {
               q += readU30(abc, q).n;
            }
            else if (kind == 0x1d)
            {
               q += readU30(abc, q).n;
               r = readU30(abc, q);
               q += r.n;
               for (k = 0; k < r.v; k++) { q += readU30(abc, q).n; }
            }
            else if (kind != 0x11 && kind != 0x12)
            {
               throw new Error("unknown multiname kind " + kind);
            }
            if (nm == idx && (kind == 0x07 || kind == 0x0d))
            {
               out.push(i);
            }
         }
         return out;
      }

      /** `findproperty M; <op> <operand>; initproperty|setproperty M`: each operand's place and value. */
      private static function findAssignments(abc:ByteArray, names:Array, op:int) : Array
      {
         var hits:Array = [];
         for each (var m:int in names)
         {
            var mb:Array = u30Bytes(m, 0);
            for each (var find:int in [FINDPROPERTY, FINDPROPSTRICT])
            {
               var head:Array = [find].concat(mb, [op]);
               var at:int = indexOf(abc, head, 0);
               while (at >= 0)
               {
                  var opndAt:int = at + head.length;
                  var opnd:Object = readU30(abc, opndAt);
                  var after:int = opndAt + opnd.n;
                  if ((abc[after] == INITPROPERTY || abc[after] == SETPROPERTY) && matches(abc, after + 1, mb))
                  {
                     hits.push({ at: opndAt, len: opnd.n, value: opnd.v });
                  }
                  at = indexOf(abc, head, at + 1);
               }
            }
         }
         return hits;
      }

      private static function matches(b:ByteArray, at:int, pattern:Array) : Boolean
      {
         if (at + pattern.length > b.length)
         {
            return false;
         }
         for (var i:int = 0; i < pattern.length; i++)
         {
            if (b[at + i] != pattern[i])
            {
               return false;
            }
         }
         return true;
      }

      private static function indexOf(b:ByteArray, pattern:Array, from:int) : int
      {
         var first:int = pattern[0];
         var last:int = b.length - pattern.length;
         for (var i:int = from; i <= last; i++)
         {
            if (b[i] == first && matches(b, i, pattern))
            {
               return i;
            }
         }
         return -1;
      }

      private static function appendString(abc:ByteArray, pool:Object, s:String) : ByteArray
      {
         var bytes:ByteArray = new ByteArray();
         bytes.writeUTFBytes(s);
         var countOld:Object = readU30(abc, pool.stringCountAt);
         var out:ByteArray = new ByteArray();
         out.writeBytes(abc, 0, pool.stringCountAt);
         writeArray(out, u30Bytes(pool.stringCount + 1, 0));
         out.writeBytes(abc, pool.stringCountAt + countOld.n, pool.stringsEnd - pool.stringCountAt - countOld.n);
         writeArray(out, u30Bytes(bytes.length, 0));
         out.writeBytes(bytes);
         out.writeBytes(abc, pool.stringsEnd, abc.length - pool.stringsEnd);
         return out;
      }

      private static function writeArray(b:ByteArray, values:Array) : void
      {
         for each (var v:int in values)
         {
            b.writeByte(v);
         }
      }
   }
}
