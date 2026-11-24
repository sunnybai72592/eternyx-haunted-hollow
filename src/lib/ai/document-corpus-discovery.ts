import {addCorpusDocuments,type CorpusDocument} from "./document-corpus-tools";
const stop=new Set("the a an and or to of in on for is are was were be been it this that with as at by from not can will has have had".split(" "));
const words=(s:string)=>s.normalize("NFKC").toLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu)??[];
const eligible=(s:string)=>s.length>=3&&s.length<=64&&!stop.has(s)&&/\p{L}/u.test(s);
type Field={key:string;value:string;line:number};
export function discoverCorpus(documents:readonly CorpusDocument[]){
  const docs=addCorpusDocuments([],documents);
  const frequencies=docs.map(d=>{
    const counts=new Map<string,number>();
    for(const term of words(d.text))if(eligible(term))counts.set(term,(counts.get(term)??0)+1);
    return counts;
  });
  const df=new Map<string,number>();
  for(const terms of frequencies)for(const term of terms.keys())df.set(term,(df.get(term)??0)+1);
  const profiles=docs.map((d,i)=>{
    const lines=d.text.split(/\r\n|\r|\n/);
    const fields:Field[]=[];let fieldCount=0;
    for(const [n,line] of lines.entries()){
      const match=/^\s*([\p{L}][\p{L}\p{N} _.-]{0,59})\s*[:=]\s*(\S.{0,239})\s*$/u.exec(line);
      if(match){fieldCount++;if(fields.length<20)fields.push({key:match[1].trim(),value:match[2].trim(),line:n+1});}
    }
    const topTerms=[...frequencies[i]].sort(([a,x],[b,y])=>y-x||(a<b?-1:a>b?1:0)).slice(0,8).map(([term,count])=>({term,count}));
    const headings=lines.filter(l=>/^#{1,6}\s+\S/.test(l)).length;
    const cellLines=lines.filter(l=>/^[A-Z]{1,3}[1-9]\d{0,6}\t/.test(l)).length;
    return {id:d.id,name:d.name,kind:d.kind,characters:d.text.length,lines:lines.length,distinctTerms:frequencies[i].size,topTerms,headings,cellLines,fields,fieldCount};
  });
  const vectors=frequencies.map(terms=>new Map([...terms].map(([term,count])=>[term,(1+Math.log(count))*(1+Math.log((docs.length+1)/((df.get(term)??0)+1)))])));
  const norms=vectors.map(v=>Math.sqrt([...v.values()].reduce((sum,x)=>sum+x*x,0)));
  const relationships=[];
  for(let i=0;i<docs.length;i++)for(let j=i+1;j<docs.length;j++){
    const a=vectors[i],b=vectors[j];
    const shared=[...a.keys()].filter(t=>b.has(t));
    const dot=shared.reduce((sum,t)=>sum+a.get(t)!*b.get(t)!,0);
    const cosine=norms[i]&&norms[j]?Math.min(1,dot/(norms[i]*norms[j])):0;
    const exact=docs[i].text===docs[j].text;
    if(!shared.length&&!exact)continue;
    relationships.push({leftId:docs[i].id,rightId:docs[j].id,leftName:docs[i].name,rightName:docs[j].name,
      exact,cosine,sharedCount:shared.length,sharedTerms:shared.sort((x,y)=>a.get(y)!*b.get(y)!-a.get(x)!*b.get(x)!||(x<y?-1:x>y?1:0)).slice(0,8)});
  }
  relationships.sort((a,b)=>Number(b.exact)-Number(a.exact)||b.cosine-a.cosine||b.sharedCount-a.sharedCount||(a.leftId<b.leftId?-1:a.leftId>b.leftId?1:a.rightId<b.rightId?-1:a.rightId>b.rightId?1:0));
  const themes=[...df].filter(([,count])=>count>=2).sort(([a,x],[b,y])=>y-x||(a<b?-1:a>b?1:0)).slice(0,20).map(([term,sourceCount])=>({term,sourceCount}));
  return {profiles,relationships,themes};
}
export function formatDiscoveryCounts(report:ReturnType<typeof discoverCorpus>){
  return ["ETERNYX local discovery (counts only)","Lexical overlap is not semantic equivalence or factual agreement.","Sources: "+report.profiles.length,"Related source pairs: "+report.relationships.length,"Exact decoded-text duplicate pairs: "+report.relationships.filter(r=>r.exact).length,"Displayed shared terms: "+report.themes.length,"Recognized literal key/value lines: "+report.profiles.reduce((n,p)=>n+p.fieldCount,0)].join("\n");
}
