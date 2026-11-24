import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {deflateRawSync} from "node:zlib";
import {DOMParser} from "@xmldom/xmldom";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const core=url(compile(await read("src/lib/ai/document-corpus-tools.ts")));
const zipUrl=url(compile(await read("src/lib/ai/document-corpus-office-zip.ts")));
const zipApi=await import(zipUrl);
const api=await import(url(compile(await read("src/lib/ai/document-corpus-office.ts")).replace('"./document-corpus-office-zip"',JSON.stringify(zipUrl)).replace('"./document-corpus-tools"',JSON.stringify(core))));
const parse=text=>new DOMParser({errorHandler:{warning:()=>{throw Error("XML warning")},error:()=>{throw Error("XML error")},fatalError:()=>{throw Error("XML fatal")}}}).parseFromString(text,"application/xml");
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function zip(entries,deflate=false){
 const local=[],central=[];let offset=0;
 for(const [name,text] of entries){
  const n=Buffer.from(name),raw=Buffer.from(text),data=deflate?deflateRawSync(raw):raw,c=crc(raw);
  const h=Buffer.alloc(30),d=Buffer.alloc(46);
  h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(deflate?8:0,8);h.writeUInt32LE(c,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(n.length,26);
  d.writeUInt32LE(0x02014b50);d.writeUInt16LE(20,4);d.writeUInt16LE(20,6);d.writeUInt16LE(deflate?8:0,10);d.writeUInt32LE(c,16);d.writeUInt32LE(data.length,20);d.writeUInt32LE(raw.length,24);d.writeUInt16LE(n.length,28);d.writeUInt32LE(offset,42);
  local.push(h,n,data);central.push(d,n);offset+=h.length+n.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return new Uint8Array(Buffer.concat([...local,directory,end]));
}
const W="http://schemas.openxmlformats.org/wordprocessingml/2006/main",S="http://schemas.openxmlformats.org/spreadsheetml/2006/main",R="http://schemas.openxmlformats.org/officeDocument/2006/relationships",P="http://schemas.openxmlformats.org/package/2006/relationships",C="http://schemas.openxmlformats.org/package/2006/content-types";
const types=(part,type)=>'<Types xmlns="'+C+'"><Override PartName="'+part+'" ContentType="application/vnd.openxmlformats-officedocument.'+type+'.main+xml"/></Types>';
const T="http://schemas.openxmlformats.org/presentationml/2006/main",A="http://schemas.openxmlformats.org/drawingml/2006/main";
const slide=(content,hidden=false)=>'<p:sld xmlns:p="'+T+'" xmlns:a="'+A+'"'+(hidden?' show="0"':'')+'><p:cSld><p:spTree><p:sp><p:txBody>'+content+'</p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
const deck=()=>[["[Content_Types].xml",types("/ppt/presentation.xml","presentationml.presentation")],["ppt/presentation.xml",'<p:presentation xmlns:p="'+T+'" xmlns:r="'+R+'"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>'],["ppt/_rels/presentation.xml.rels",'<Relationships xmlns="'+P+'"><Relationship Id="rId1" Type="'+R+'/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="'+R+'/slide" Target="/ppt/slides/slide2.xml"/></Relationships>'],["ppt/slides/slide1.xml",slide('<a:p><a:r><a:t>Steel pipeline</a:t></a:r></a:p>',true)],["ppt/slides/slide2.xml",slide('<a:p><a:r><a:t>Inspection پښتو</a:t></a:r><a:br/><a:r><a:t>Ready</a:t></a:r></a:p><a:p><a:fld><a:t>2</a:t></a:fld></a:p>')]];
const discovery=await import(url(compile(await read("src/lib/ai/document-corpus-discovery.ts")).replace('"./document-corpus-tools"',JSON.stringify(core))));
const doc=(id,text,kind="txt")=>({id,name:id+".txt",kind,text});
test("PPTX genuine stored and deflated archives follow presentation order, not filenames",async()=>{
 for(const deflate of [false,true]){
 const report=await api.extractOfficeDocument("deck.pptx",zip(deck(),deflate),parse);
 assert.equal(report.format,"pptx");
 assert.deepEqual(report.sections,[{label:"Slide 1",text:"Inspection پښتو\nReady\n2"},{label:"Slide 2 (hidden)",text:"Steel pipeline"}]);
 }
});
test("empty slides are skipped without renumbering remaining slides",async()=>{
 const parts=deck();parts[4][1]=slide("<a:p/>");
 const report=await api.extractOfficeDocument("deck.pptx",zip(parts),parse);
 assert.deepEqual(report.sections.map(s=>s.label),["Slide 2 (hidden)"]);
});
test("rejects duplicate slide targets, missing slides, external relationships and traversal",async()=>{
 const variants=[
 s=>s.replace('Target="/ppt/slides/slide2.xml"','Target="slides/slide1.xml"'),
 s=>s.replace('Target="/ppt/slides/slide2.xml"','Target="slides/missing.xml"'),
 s=>s.replace('Target="/ppt/slides/slide2.xml"','Target="https://example.invalid/slide.xml" TargetMode="External"'),
 s=>s.replace('Target="/ppt/slides/slide2.xml"','Target="../slides/slide2.xml"')
 ];
 for(const change of variants){const parts=deck();parts[2][1]=change(parts[2][1]);await assert.rejects(()=>api.extractOfficeDocument("deck.pptx",zip(parts),parse));}
});
test("PPTX selected slide retains stable label and extracted text in actual knowledge index",async()=>{
 const report=await api.extractOfficeDocument("deck.pptx",zip(deck()),parse);
 const docs=api.planOfficeImport([],report,[1],["slide"]);
 const knowledge=await import(url(compile(await read("src/lib/ai/document-corpus-knowledge.ts")).replace('"./document-corpus-tools"',JSON.stringify(core))));
 const result=knowledge.searchKnowledgeIndex(knowledge.buildKnowledgeIndex(docs),"steel pipeline","all");
 assert.equal(result.totalMatches,1);assert.match(result.results[0].documentName,/Slide 2 \(hidden\)/);
 assert.equal(result.results[0].text,"Steel pipeline");
});
test("source profiles expose exact literal fields and coordinates without inference",()=>{
 const report=discovery.discoverCorpus([doc("a","# Inspection\r\nStatus: Ready\r\nA1\tSteel\r\nPressure = 50 psi","md")]);
 const p=report.profiles[0];
 assert.equal(p.headings,1);assert.equal(p.cellLines,1);assert.equal(p.lines,4);
 assert.deepEqual(p.fields,[{key:"Status",value:"Ready",line:2},{key:"Pressure",value:"50 psi",line:4}]);
});
test("exact duplicates rank first; unrelated sources do not create artificial edges",()=>{
 const result=discovery.discoverCorpus([doc("a","steel pipe corrosion"),doc("b","steel pipe corrosion"),doc("c","steel paint"),doc("d","banana apple")]);
 assert.equal(result.relationships.length,3);
 assert.equal(result.relationships[0].exact,true);
 assert.ok(Math.abs(result.relationships[0].cosine-1)<1e-10);
 assert.ok(result.relationships.every(r=>r.leftId!=="d"&&r.rightId!=="d"));
 assert.equal(result.themes.find(t=>t.term==="steel").sourceCount,3);
});
test("identical punctuation-only documents remain exact duplicates, without lexical score",()=>{
 const result=discovery.discoverCorpus([doc("a","!!!"),doc("b","!!!")]);
 assert.equal(result.relationships[0].exact,true);assert.equal(result.relationships[0].cosine,0);
});
test("Unicode terms and normalization are deterministic; reports disclose counts only",()=>{
 const result=discovery.discoverCorpus([doc("a","ＰＩＰＥ پښتو"),doc("b","pipe پښتو")]);
 assert.deepEqual(result.themes.map(t=>t.term).sort(),["pipe","پښتو"].sort());
 const report=discovery.formatDiscoveryCounts(result);
 assert.ok(!report.includes("a.txt")&&!report.includes("پښتو")&&!report.includes("pipe"));
 assert.match(report,/not semantic equivalence/);
});
test("field and vocabulary preview bounds preserve total counts",()=>{
 const text=Array.from({length:30},(_,i)=>"Field "+i+": Value "+i).join("\n");
 const report=discovery.discoverCorpus([doc("a",text),doc("b",text)]);
 assert.equal(report.profiles[0].fields.length,20);assert.equal(report.profiles[0].fieldCount,30);
 assert.ok(report.themes.length<=20);
});
test("UI exposes PPTX, stale discovery suppression, explicit search and local report",async()=>{
 const office=await read("src/components/ai/LocalOfficeCorpusImport.tsx"),component=await read("src/components/ai/LocalCorpusDiscovery.tsx"),page=await read("src/pages/AIDocumentIntelligence.tsx");
 assert.match(office,/accept="\.docx,\.xlsx,\.pptx"/);
 for(const v of ["snapshot?.documents===documents","Discover local source relationships","Copy counts-only discovery report","onSearch(term)"])assert.ok(component.includes(v),v);
 assert.doesNotMatch(component,/fetch\(|localStorage|functions\.invoke\(/);
 const handler=page.slice(page.indexOf("const searchDiscoveredTerm="),page.indexOf("const runLocalKnowledge="));
 assert.match(handler,/searchKnowledgeIndex\(index,term,"all"\)/);
 assert.match(handler,/invalidateKnowledgeResults\(\)/);
});
