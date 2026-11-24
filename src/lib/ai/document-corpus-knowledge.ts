/** Local lexical retrieval, not embeddings, semantic inference or generated answers. */
import {addCorpusDocuments,type CorpusDocument} from "./document-corpus-tools";
export const KNOWLEDGE_CHUNK_CHARS=1000;
export const KNOWLEDGE_MAX_CHUNKS=2400;
export const KNOWLEDGE_MAX_RESULTS=30;
type Passage={
  id:string; documentId:string; documentName:string; startOffset:number; endOffset:number;
  startLine:number; endLine:number; text:string; tokenCount:number;
};
export type KnowledgeIndex={
  passages:readonly Passage[];
  postings:ReadonlyMap<string,ReadonlyMap<number,number>>;
  documentIds:readonly string[];
  averageLength:number;
};
const tokens=(text:string)=>text.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu)??[];
export class KnowledgeError extends Error {
  constructor(readonly code:"chunk_limit"|"invalid_query"|"invalid_filter"|"empty_index"){super(code);this.name="KnowledgeError";}
}
// Prefer line or whitespace boundaries in the last 300 characters of the window.
// Exceptionally long unbroken tokens may be split. Never split surrogate pairs.
function boundary(text:string,start:number):number{
  const cap=Math.min(start+KNOWLEDGE_CHUNK_CHARS,text.length);
  if(cap===text.length)return cap;
  const min=start+700;
  const newline=text.lastIndexOf("\n",cap-1);
  if(newline>=min)return newline+1;
  for(let i=cap-1;i>=min;i--)if(/\s/u.test(text[i]) && !(text[i]==="\r"&&text[i+1]==="\n"))return i+1;
  return /[\uD800-\uDBFF]/.test(text[cap-1]) && /[\uDC00-\uDFFF]/.test(text[cap]) ? cap-1:cap;
}
function lineAt(breaks:readonly number[],offset:number):number{
  let lo=0,hi=breaks.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(breaks[mid]<=offset)lo=mid+1;else hi=mid;}
  return lo+1;
}
export function buildKnowledgeIndex(documents:readonly CorpusDocument[]):KnowledgeIndex{
  const docs=addCorpusDocuments([],documents);
  const passages:Passage[]=[];
  const postings=new Map<string,Map<number,number>>();
  let totalTokens=0;
  for(const doc of docs){
    const breaks=Array.from(doc.text.matchAll(/\r\n|\r|\n/g),m=>m.index!+m[0].length);
    let start=0;
    while(start<doc.text.length){
      let end=boundary(doc.text,start);
      // Keep CRLF intact if a hard boundary falls between CR and LF.
      if(doc.text[end-1]==="\r"&&doc.text[end]==="\n")end--;
      const text=doc.text.slice(start,end);
      const terms=tokens(text);
      if(terms.length){
        if(passages.length>=KNOWLEDGE_MAX_CHUNKS)throw new KnowledgeError("chunk_limit");
        const position=passages.length;
        passages.push({id:doc.id+":"+start,documentId:doc.id,documentName:doc.name,startOffset:start,endOffset:end,
          startLine:lineAt(breaks,start),endLine:lineAt(breaks,end-1),text,tokenCount:terms.length});
        totalTokens+=terms.length;
        const counts=new Map<string,number>();
        for(const term of terms)counts.set(term,(counts.get(term)??0)+1);
        for(const [term,count] of counts){
          let list=postings.get(term);
          if(!list){list=new Map();postings.set(term,list);}
          list.set(position,count);
        }
      }
      start=end;
    }
  }
  return {passages,postings,documentIds:docs.map(d=>d.id),averageLength:passages.length?totalTokens/passages.length:0};
}
export function searchKnowledgeIndex(index:KnowledgeIndex,query:string,mode:"all"|"any",sourceId:string|null=null,options:{expansion?:string;diversify?:boolean}={}){
  if(typeof query!=="string"||query.length>120||query.includes("\u0000")||!(mode==="all"||mode==="any"))throw new KnowledgeError("invalid_query");
  const terms=[...new Set(tokens(query))];
  if(!terms.length||terms.length>8)throw new KnowledgeError("invalid_query");
  const expansion=options.expansion??"";
  if(typeof expansion!=="string"||expansion.length>120||expansion.includes("\u0000"))throw new KnowledgeError("invalid_query");
  const expansionTerms=[...new Set(tokens(expansion))].filter(term=>!terms.includes(term));
  if((expansion.trim()&&!tokens(expansion).length)||terms.length+expansionTerms.length>8)throw new KnowledgeError("invalid_query");
  const primary=new Set(terms);
  if(sourceId!==null&&!index.documentIds.includes(sourceId))throw new KnowledgeError("invalid_filter");
  if(!index.passages.length)throw new KnowledgeError("empty_index");
  const scores=new Map<number,{score:number;matched:string[]}>();
  const N=index.passages.length,k1=1.2,b=.75;
  for(const term of [...terms,...expansionTerms]){
    const posting=index.postings.get(term);
    if(!posting)continue;
    const idf=Math.log(1+(N-posting.size+.5)/(posting.size+.5));
    for(const [position,tf] of posting){
      const p=index.passages[position];
      if(sourceId!==null&&p.documentId!==sourceId)continue;
      const value=scores.get(position)??{score:0,matched:[]};
      value.score+=(primary.has(term)?1:0.5)*idf*tf*(k1+1)/(tf+k1*(1-b+b*p.tokenCount/index.averageLength));
      value.matched.push(term);scores.set(position,value);
    }
  }
  const ranked=[...scores].filter(([,value])=>mode==="any"||terms.every(term=>value.matched.includes(term)))
    .sort(([a,x],[b,y])=>y.score-x.score||a-b);
  let ordered=ranked;
  if(options.diversify){
    // Round-robin across sources in first-ranked-source order. Within each source
    // keep BM25 order. This intentionally trades pure score order for coverage.
    const groups=new Map<string,typeof ranked>();
    for(const entry of ranked){
      const id=index.passages[entry[0]].documentId;
      const group=groups.get(id)??[];
      group.push(entry);groups.set(id,group);
    }
    ordered=[];
    const longest=Math.max(0,...Array.from(groups.values(),group=>group.length));
    for(let round=0;round<longest;round++)for(const group of groups.values())if(group[round])ordered.push(group[round]);
  }
  return {totalMatches:ranked.length,terms,expansionTerms,matchingSources:new Set(ranked.map(([i])=>index.passages[i].documentId)).size,
    results:ordered.slice(0,KNOWLEDGE_MAX_RESULTS).map(([i,value])=>({...index.passages[i],score:value.score,matchedTerms:value.matched}))};
}
export function formatKnowledgePassage(p:Passage):string{
  return p.documentName+" | lines "+p.startLine+"–"+p.endLine+" | decoded UTF-16 offsets ["+p.startOffset+", "+p.endOffset+")\n"+p.text;
}
