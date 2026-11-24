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
const word=(body='<w:p><w:r><w:t>Pipe inspection پښتو</w:t><w:tab/><w:t>Ready</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table value</w:t></w:r></w:p></w:tc></w:tr></w:tbl>')=>[["[Content_Types].xml",types("/word/document.xml","wordprocessingml.document")],["word/document.xml",'<w:document xmlns:w="'+W+'"><w:body>'+body+'</w:body></w:document>']];
const excel=()=>[["[Content_Types].xml",types("/xl/workbook.xml","spreadsheetml.sheet")],["xl/workbook.xml",'<workbook xmlns="'+S+'" xmlns:r="'+R+'"><sheets><sheet name="Readings" r:id="rId1"/><sheet name="Hidden" state="hidden" r:id="rId2"/></sheets></workbook>'],["xl/_rels/workbook.xml.rels",'<Relationships xmlns="'+P+'"><Relationship Id="rId1" Type="'+R+'/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+R+'/worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>'],["xl/sharedStrings.xml",'<sst xmlns="'+S+'"><si><r><t>Steel</t></r><r><t> pipe</t></r></si></sst>'],["xl/worksheets/sheet1.xml",'<worksheet xmlns="'+S+'"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><f>2+3</f><v>5</v></c><c r="C1"><f>NOW()</f></c><c r="D1" t="b"><v>1</v></c></row></sheetData></worksheet>'],["xl/worksheets/sheet2.xml",'<worksheet xmlns="'+S+'"><sheetData><row><c r="A1" t="inlineStr"><is><t>Private note</t></is></c></row></sheetData></worksheet>']];
test("real DOCX ZIP extracts exact paragraph and table text for stored and deflated archives",async()=>{
 for(const deflate of [false,true]){
 const result=await api.extractOfficeDocument("report.docx",zip(word(),deflate),parse);
 assert.equal(result.format,"docx");assert.equal(result.sections[0].text,"Pipe inspection پښتو\tReady\nTable value");
 }
});
test("real XLSX ZIP extracts shared strings, sheet labels, cell coordinates and cached formulas",async()=>{
 const result=await api.extractOfficeDocument("readings.xlsx",zip(excel(),true),parse);
 assert.equal(result.sections.length,2);assert.equal(result.formulaCells,2);assert.equal(result.missingFormulaCache,1);
 assert.equal(result.sections[0].text,"A1\tSteel pipe\nB1\t[cached formula value] 5\nC1\t[no cached value]\nD1\tTRUE");
 assert.match(result.sections[1].label,/hidden/);assert.equal(result.sections[1].text,"A1\tPrivate note");
 assert.ok(!result.sections[0].text.includes("NOW()"));
});
test("rejects ZIP traversal, duplicate entries, macro parts and corrupt checksums",async()=>{
 for(const entries of [[...word(),["../escape","x"]],[...word(),word()[0]],[...word(),["word/vbaProject.bin","x"]]])assert.throws(()=>zipApi.openOfficeZip(zip(entries)));
 const bytes=zip(word());bytes[30+Buffer.byteLength("[Content_Types].xml")]^=1;
 await assert.rejects(()=>api.extractOfficeDocument("a.docx",bytes,parse));
});
test("rejects DTD and mismatched format instead of parsing active XML or guessing",async()=>{
 const entries=word();entries[1][1]='<!DOCTYPE x [<!ENTITY xx SYSTEM "file:///etc/passwd">]>'+entries[1][1];
 await assert.rejects(()=>api.extractOfficeDocument("a.docx",zip(entries),parse),/invalid_office_xml/);
 await assert.rejects(()=>api.extractOfficeDocument("a.xlsx",zip(word()),parse),/unsupported_office_format/);
});
test("rejects external worksheet relationship and invalid shared string references",async()=>{
 const external=excel();external[2][1]=external[2][1].replace('Target="worksheets/sheet1.xml"','Target="https://example.invalid/sheet.xml" TargetMode="External"');
 await assert.rejects(()=>api.extractOfficeDocument("a.xlsx",zip(external),parse));
 const bad=excel();bad[4][1]=bad[4][1].replace("<v>0</v>","<v>99</v>");
 await assert.rejects(()=>api.extractOfficeDocument("a.xlsx",zip(bad),parse));
});
test("rejects oversized text rather than truncating extraction",async()=>{
 await assert.rejects(()=>api.extractOfficeDocument("a.docx",zip(word('<w:p><w:r><w:t>'+"x".repeat(100001)+'</w:t></w:r></w:p>')),parse),/office_text_limit/);
});
test("selective atomic import preserves extracted text and source names; rejects stale selection",async()=>{
 const report=await api.extractOfficeDocument("a.xlsx",zip(excel()),parse);
 const docs=api.planOfficeImport([],report,[1],["a"]);
 assert.equal(docs[0].text,report.sections[1].text);assert.match(docs[0].name,/Sheet Hidden/);
 assert.throws(()=>api.planOfficeImport([],report,[9],["a"]),/invalid_office_selection/);
 assert.throws(()=>api.planOfficeImport(docs,report,[1],["b"]));
});
test("extracted Word and Excel sections enter real knowledge retrieval",async()=>{
 const report=await api.extractOfficeDocument("a.xlsx",zip(excel()),parse);
 const docs=api.planOfficeImport([],report,[0,1],["a","b"]);
 const knowledge=await import(url(compile(await read("src/lib/ai/document-corpus-knowledge.ts")).replace('"./document-corpus-tools"',JSON.stringify(core))));
 const result=knowledge.searchKnowledgeIndex(knowledge.buildKnowledgeIndex(docs),"steel pipe","all");
 assert.equal(result.totalMatches,1);assert.match(result.results[0].documentName,/Readings/);
});
test("local UI has explicit selection, bounds, account-keyed parent and no network",async()=>{
 const component=await read("src/components/ai/LocalOfficeCorpusImport.tsx"),page=await read("src/pages/AIDocumentIntelligence.tsx");
 for(const value of ["window.confirm(","planOfficeImport(","version.current===n","preview truncated","Discard Office preview"])assert.ok(component.includes(value),value);
 assert.doesNotMatch(component,/fetch\(|\.upload\(|functions\.invoke\(|localStorage/);
 assert.match(page,/importStoredPdfSources\(next,"office"\)/);
 assert.match(page,/AIDocumentIntelligenceWorkspace key=\{ownerId\}/);
});
