/** Reviewed dormant deployment contract. A later source review is mandatory
 * before ANY activation; environment flags alone cannot unlock this release.
 * This module has no privileged client, network access or secret reads.
 */
export const RANGE_DORMANT_RELEASE = true;
export function rangeActivationPermitted() {
  return RANGE_DORMANT_RELEASE === false;
}
export class BoundedRangeBodyError extends Error {
  constructor(status){super("Range request rejected");this.status=status;}
}
export async function readBoundedRangeJson(request,maxBytes){
  if(![256,512].includes(maxBytes))throw new BoundedRangeBodyError(400);
  const length=request.headers.get("content-length");
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes)){
    await request.body?.cancel().catch(()=>{});
    throw new BoundedRangeBodyError(413);
  }
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")??"")){
    await request.body?.cancel().catch(()=>{});
    throw new BoundedRangeBodyError(415);
  }
  const reader=request.body?.getReader();
  if(!reader)throw new BoundedRangeBodyError(400);
  let total=0;const chunks=[];
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>maxBytes)throw new BoundedRangeBodyError(413);
      chunks.push(value);
    }
    const bytes=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  }catch(e){
    if(e instanceof BoundedRangeBodyError)throw e;
    throw new BoundedRangeBodyError(400);
  }finally{await reader.cancel().catch(()=>{});}
}
