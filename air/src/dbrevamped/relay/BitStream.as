package dbrevamped.relay
{
   import flash.utils.ByteArray;

   /**
    * The game's bit-packed packet fields, most significant bit first (the client's Packet class):
    * uint = a 4-bit size p then (p + 1) * 2 bits; str = a 16-bit byte length then UTF-8 bytes.
    * Reads from the bytes it was given, or writes after them; ServerRelay reads 0x10 and 0x21 with
    * it and writes the rewritten 0x21.
    */
   public class BitStream
   {
      public var bytes:ByteArray;
      /** The next bit to read. */
      public var bit:int = 0;
      /** Bits written so far. */
      private var written:int = 0;

      public function BitStream(bytes:ByteArray)
      {
         this.bytes = bytes;
      }

      public function bits(n:int) : Number
      {
         if (bit + n > bytes.length * 8)
         {
            throw new RangeError("packet ended early");
         }
         var v:Number = 0;
         var left:int = n;
         while (left > 0)
         {
            var b:int = bytes[bit >> 3];
            var off:int = bit & 7;
            var take:int = Math.min(left, 8 - off);
            var shift:int = 8 - off - take;
            v = v * (1 << take) + ((b >> shift) & ((1 << take) - 1));
            bit += take;
            left -= take;
         }
         return v;
      }

      public function bool() : Boolean
      {
         return bits(1) == 1;
      }

      public function readUint() : int
      {
         var p:int = bits(4);
         return bits((p + 1) * 2);
      }

      public function readStr() : String
      {
         var len:int = bits(16);
         if (bit + len * 8 > bytes.length * 8)
         {
            throw new RangeError("packet ended early");
         }
         var out:ByteArray = new ByteArray();
         for (var i:int = 0; i < len; i++)
         {
            out.writeByte(bits(8));
         }
         out.position = 0;
         return out.readUTFBytes(len);
      }

      public function writeBits(value:Number, n:int) : void
      {
         for (var i:int = n - 1; i >= 0; i--)
         {
            var one:Boolean = Math.floor(value / Math.pow(2, i)) % 2 == 1;
            var at:int = written >> 3;
            while (bytes.length <= at)
            {
               bytes[bytes.length] = 0;
            }
            if (one)
            {
               bytes[at] = bytes[at] | (0x80 >> (written & 7));
            }
            written++;
         }
      }

      /** The fewest even number of bits that hold the value, behind a 4-bit prefix (bits / 2 - 1). */
      public function writeUint(v:Number) : void
      {
         var width:int = Math.max(1, Math.floor(v).toString(2).length);
         width += width & 1;
         writeBits(width / 2 - 1, 4);
         writeBits(v, width);
      }

      public function writeStr(s:String) : void
      {
         var b:ByteArray = new ByteArray();
         b.writeUTFBytes(s);
         writeBits(b.length, 16);
         for (var i:int = 0; i < b.length; i++)
         {
            writeBits(b[i], 8);
         }
      }

      /** Copies `count` bits of `from` starting at bit `start`. */
      public function copy(from:ByteArray, start:int, count:int) : void
      {
         var r:BitStream = new BitStream(from);
         r.bit = start;
         var left:int = count;
         while (left > 0)
         {
            var n:int = Math.min(left, 24);
            writeBits(r.bits(n), n);
            left -= n;
         }
      }
   }
}
