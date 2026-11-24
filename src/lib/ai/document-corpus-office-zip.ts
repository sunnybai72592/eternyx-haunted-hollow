/** Restricted ZIP reader for local OOXML text ingestion. No filesystem, network, or execution. */
export const MAX_OFFICE_BYTES=8*1024*1024;
const MAX_ENTRIES=512, MAX_PART=4*1024*1024, MAX_TOTAL=32*1024*1024;
type Entry={name:string;flags:number;method:number;crc:number;compressed:number;size:number;offset:number};
const invalid=()=>new Error("invalid_office_archive");
function crc32(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function openOfficeZip(bytes:Uint8Array){
  if(bytes.length<22||bytes.length>MAX_OFFICE_BYTES)throw invalid();
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=(p:number)=>v.getUint16(p,true),u32=(p:number)=>v.getUint32(p,true);
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(i)===0x06054b50&&i+22+u16(i+20)===bytes.length){end=i;break;}
  if(end<0||u16(end+4)!==0||u16(end+6)!==0)throw invalid();
  const count=u16(end+10),size=u32(end+12),start=u32(end+16);
  if(!count||count>MAX_ENTRIES||u16(end+8)!==count||start+size!==end)throw invalid();
  const decoder=new TextDecoder("utf-8",{fatal:true});
  const entries=new Map<string,Entry>();
  const lowerNames=new Set<string>();let cursor=start,total=0;
  for(let i=0;i<count;i++){
    if(cursor+46>end||u32(cursor)!==0x02014b50)throw invalid();
    const flags=u16(cursor+8),method=u16(cursor+10),crc=u32(cursor+16),compressed=u32(cursor+20),size=u32(cursor+24);
    const nameLen=u16(cursor+28),extra=u16(cursor+30),comment=u16(cursor+32),offset=u32(cursor+42);
    const next=cursor+46+nameLen+extra+comment;
    if(!nameLen||nameLen>255||next>end||u16(cursor+34)!==0||(flags&~0x080e)!==0||![0,8].includes(method)||size>MAX_PART||compressed>MAX_OFFICE_BYTES||offset+30>start)throw invalid();
    const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLen));
    if(!/^[A-Za-z0-9_.\-\/[\] ]+$/.test(name)||name.startsWith("/")||name.split("/").some((s,j,a)=>s==="."||s===".."||(!s&&j!==a.length-1))||lowerNames.has(name.toLowerCase()))throw invalid();
    if(/(?:vbaProject|vbaData|activeX|macros)/i.test(name))throw new Error("active_office_content");
    total+=size;if(total>MAX_TOTAL)throw invalid();
    lowerNames.add(name.toLowerCase());entries.set(name,{name,flags,method,crc,compressed,size,offset});cursor=next;
  }
  if(cursor!==end)throw invalid();
  const ranges:{start:number;end:number}[]=[];
  for(const e of entries.values()){
    const p=e.offset;
    if(u32(p)!==0x04034b50||u16(p+6)!==e.flags||u16(p+8)!==e.method)throw invalid();
    const n=u16(p+26),extra=u16(p+28),data=p+30+n+extra;
    if(data+e.compressed>start||decoder.decode(bytes.subarray(p+30,p+30+n))!==e.name)throw invalid();
    if(!(e.flags&8)&&(u32(p+14)!==e.crc||u32(p+18)!==e.compressed||u32(p+22)!==e.size))throw invalid();
    if(e.method===0&&e.size!==e.compressed)throw invalid();
    ranges.push({start:p,end:data+e.compressed});
  }
  ranges.sort((a,b)=>a.start-b.start);
  if(ranges.some((range,i)=>i>0&&ranges[i-1].end>range.start))throw invalid();
  return {
    names:[...entries.keys()],
    async read(name:string){
      const e=entries.get(name);if(!e)throw new Error("missing_office_part");
      const p=e.offset+30+u16(e.offset+26)+u16(e.offset+28);
      const input=bytes.slice(p,p+e.compressed);
      let output:Uint8Array;
      if(e.method===0)output=input;
      else{
        if(typeof DecompressionStream==="undefined")throw new Error("office_browser_unsupported");
        let stream:ReadableStream<Uint8Array>;
        try{stream=new Blob([input]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));}
        catch{throw new Error("office_browser_unsupported");}
        const reader=stream.getReader();output=new Uint8Array(e.size);let written=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;if(written+value.length>output.length)throw invalid();output.set(value,written);written+=value.length;}if(written!==e.size)throw invalid();}
        finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      }
      if(output.length!==e.size||crc32(output)!==e.crc)throw invalid();
      return decoder.decode(output);
    },
  };
}
