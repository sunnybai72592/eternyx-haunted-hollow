import {openOfficeZip,MAX_OFFICE_BYTES} from "./document-corpus-office-zip";
import {addCorpusDocuments,type CorpusDocument} from "./document-corpus-tools";
const W="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const S="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const R="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P="http://schemas.openxmlformats.org/package/2006/relationships";
const C="http://schemas.openxmlformats.org/package/2006/content-types";
const T="http://schemas.openxmlformats.org/presentationml/2006/main";
const A="http://schemas.openxmlformats.org/drawingml/2006/main";
const MAX_TEXT=100000,MAX_SHEETS=30,MAX_CELLS=20000,MAX_SLIDES=60;
type Parser=(text:string)=>Document;
const nativeParser:Parser=text=>new DOMParser().parseFromString(text,"application/xml");
const elements=(node:Document|Element,ns:string,name:string)=>Array.from(node.getElementsByTagNameNS(ns,name));
const children=(node:Element,ns:string,name:string)=>Array.from(node.childNodes).filter((n):n is Element=>n.nodeType===1&&(n as Element).namespaceURI===ns&&(n as Element).localName===name);
const first=(node:Element,ns:string,name:string)=>children(node,ns,name)[0];
function fail(code="invalid_office_xml"):never{throw new Error(code);}
function parse(text:string,parser:Parser,ns:string,name:string){
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)||text.includes("\u0000"))fail();
  const doc=parser(text);
  if(!doc.documentElement||doc.documentElement.namespaceURI!==ns||doc.documentElement.localName!==name||doc.getElementsByTagName("parsererror").length||doc.doctype)fail();
  return doc;
}
function plainText(el:Element,ns:string){return elements(el,ns,"t").map(t=>t.textContent??"").join("");}
function cellText(value:string){return value.replace(/\r/g,"\\r").replace(/\n/g,"\\n").replace(/\t/g,"\\t");}
export type OfficeExtract={name:string;format:"docx"|"xlsx"|"pptx";sections:{label:string;text:string}[];characters:number;formulaCells:number;missingFormulaCache:number};
export async function extractOfficeDocument(name:string,bytes:Uint8Array,parser:Parser=nativeParser):Promise<OfficeExtract>{
  if(typeof name!=="string"||name.length>255||/[\u0000-\u001f\u007f]/.test(name)||bytes.length>MAX_OFFICE_BYTES)fail("invalid_office_file");
  const ext=name.toLowerCase().split(".").pop();
  if(ext!=="docx"&&ext!=="xlsx"&&ext!=="pptx")return fail("invalid_office_file");
  const zip=openOfficeZip(bytes);
  const types=parse(await zip.read("[Content_Types].xml"),parser,C,"Types");
  const overrides=elements(types,C,"Override");
  const expected=ext==="docx"?["/word/document.xml","application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"]:ext==="xlsx"?["/xl/workbook.xml","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"]:["/ppt/presentation.xml","application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"];
  if(!overrides.some(e=>e.getAttribute("PartName")===expected[0]&&e.getAttribute("ContentType")===expected[1])||overrides.some(e=>/macroEnabled|vbaProject|activeX/i.test(e.getAttribute("ContentType")??"")))fail("unsupported_office_format");
  const sections:OfficeExtract["sections"]=[];
  let characters=0,formulaCells=0,missingFormulaCache=0,cells=0;
  const append=(label:string,text:string)=>{
    if(!text.trim())return;
    characters+=text.length;
    if(characters>MAX_TEXT)fail("office_text_limit");
    sections.push({label,text});
  };
  if(ext==="docx"){
    const doc=parse(await zip.read("word/document.xml"),parser,W,"document");
    const body=first(doc.documentElement,W,"body");
    if(!body)fail();
    const paragraphs=elements(body,W,"p").filter(p=>{for(let node=p.parentElement;node&&node!==body;node=node.parentElement)if(node.namespaceURI===W&&["del","moveFrom"].includes(node.localName))return false;return true;}).map(p=>{
      const chunks:string[]=[];
      const visit=(node:Node)=>{
        if(node.nodeType!==1)return;
        const e=node as Element;
        if(e.namespaceURI===W){
          if(e.localName==="del"||e.localName==="moveFrom")return;
          if(e.localName==="t"){chunks.push(e.textContent??"");return;}
          if(e.localName==="tab"){chunks.push("\t");return;}
          if(e.localName==="br"||e.localName==="cr"){chunks.push("\n");return;}
          if(e!==p&&e.localName==="p")return;
        }
        for(const child of Array.from(e.childNodes))visit(child);
      };
      visit(p);return chunks.join("");
    });
    append("Main document",paragraphs.join("\n"));
  }else if(ext==="pptx"){
    const presentation=parse(await zip.read("ppt/presentation.xml"),parser,T,"presentation");
    const rels=parse(await zip.read("ppt/_rels/presentation.xml.rels"),parser,P,"Relationships");
    const map=new Map<string,string>();
    for(const rel of elements(rels,P,"Relationship")){
      if(rel.getAttribute("Type")!==R+"/slide"||rel.getAttribute("TargetMode")==="External")continue;
      const id=rel.getAttribute("Id")??"",target=rel.getAttribute("Target")??"";
      const path=target.startsWith("/ppt/")?target.slice(1):"ppt/"+target;
      if(!id||map.has(id)||!/^ppt\/slides\/[A-Za-z0-9_.-]+\.xml$/.test(path))fail();
      map.set(id,path);
    }
    const list=first(presentation.documentElement,T,"sldIdLst");
    if(!list)fail();
    const slides=children(list,T,"sldId");
    if(!slides.length||slides.length>MAX_SLIDES)fail("office_slide_limit");
    const used=new Set<string>();
    for(const [i,slide] of slides.entries()){
      const path=map.get(slide.getAttributeNS(R,"id")??"");
      if(!path||used.has(path))fail();
      used.add(path);
      const xml=parse(await zip.read(path),parser,T,"sld");
      const tree=elements(xml,T,"spTree")[0];
      if(!tree)fail();
      const paragraphs=elements(tree,A,"p").map(p=>Array.from(p.childNodes).map(node=>{
        if(node.nodeType!==1)return "";
        const el=node as Element;
        if(el.namespaceURI!==A)return "";
        if(el.localName==="br")return "\n";
        if(el.localName==="r"||el.localName==="fld")return plainText(el,A);
        return "";
      }).join(""));
      append("Slide "+(i+1)+(xml.documentElement.getAttribute("show")==="0"||xml.documentElement.getAttribute("show")==="false"?" (hidden)":""),paragraphs.join("\n"));
    }
  }else{
    const workbook=parse(await zip.read("xl/workbook.xml"),parser,S,"workbook");
    const rels=parse(await zip.read("xl/_rels/workbook.xml.rels"),parser,P,"Relationships");
    const map=new Map<string,string>();
    for(const rel of elements(rels,P,"Relationship")){
      if(rel.getAttribute("Type")!==R+"/worksheet"||rel.getAttribute("TargetMode")==="External")continue;
      const id=rel.getAttribute("Id")??"",target=rel.getAttribute("Target")??"";
      const path=target.startsWith("/xl/")?target.slice(1):"xl/"+target;
      if(!id||map.has(id)||!/^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(path))fail();
      map.set(id,path);
    }
    const sheets=elements(workbook,S,"sheet");
    if(!sheets.length||sheets.length>MAX_SHEETS)fail("office_sheet_limit");
    const shared=zip.names.includes("xl/sharedStrings.xml")?elements(parse(await zip.read("xl/sharedStrings.xml"),parser,S,"sst"),S,"si").map(si=>plainText(si,S)):[];
    const usedPaths=new Set<string>();
    for(const sheet of sheets){
      const path=map.get(sheet.getAttributeNS(R,"id")??"");
      const label=sheet.getAttribute("name")??"";
      if(!path||usedPaths.has(path)||!label||label.length>31||/[\u0000-\u001f\u007f]/.test(label))fail();
      usedPaths.add(path);
      const xml=parse(await zip.read(path),parser,S,"worksheet");
      const data=first(xml.documentElement,S,"sheetData");
      if(!data)fail();
      const lines:string[]=[];const refs=new Set<string>();
      for(const row of children(data,S,"row"))for(const cell of children(row,S,"c")){
        if(++cells>MAX_CELLS)fail("office_cell_limit");
        const ref=cell.getAttribute("r")??"",type=cell.getAttribute("t")||"n";
        if(!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(ref)||refs.has(ref))fail();
        refs.add(ref);
        const formula=first(cell,S,"f"),v=first(cell,S,"v"),raw=v?.textContent??"";
        let value=raw;
        if(formula&&(!v||!raw)){value="";}
        else if(type==="s"){
          if(!/^(0|[1-9]\d*)$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>=shared.length)fail();
          value=shared[Number(raw)];
        }else if(type==="inlineStr"){
          const inline=first(cell,S,"is");value=inline?plainText(inline,S):"";
        }else if(type==="b"){if(raw!=="0"&&raw!=="1")fail();value=raw==="1"?"TRUE":"FALSE";}
        else if(!["n","str","e","d"].includes(type))fail("unsupported_cell_type");
        if(formula){formulaCells++;if(!v||!raw){missingFormulaCache++;value="[no cached value]";}else value="[cached formula value] "+value;}
        if(value)lines.push(ref+"\t"+cellText(value));
      }
      append("Sheet "+label+(sheet.getAttribute("state")&&sheet.getAttribute("state")!=="visible"?" (hidden)":""),
        lines.join("\n"));
    }
  }
  if(!sections.length)fail("no_office_text");
  return {name,format:ext,sections,characters,formulaCells,missingFormulaCache};
}
export function planOfficeImport(existing:readonly CorpusDocument[],report:OfficeExtract,selected:readonly number[],ids:readonly string[]){
  if(!selected.length||selected.length!==ids.length||new Set(selected).size!==selected.length||selected.some(i=>!Number.isInteger(i)||i<0||i>=report.sections.length))fail("invalid_office_selection");
  const additions:CorpusDocument[]=selected.map((i,j)=>{
    const section=report.sections[i];const suffix=" · "+section.label+".txt";
    return {id:ids[j],name:report.name.slice(0,255-suffix.length)+suffix,kind:"txt",text:section.text};
  });
  return addCorpusDocuments(existing,additions);
}
