import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {
  PHONE_MOVIE_EDIT_DRAFT_NAME,
  PHONE_MOVIE_EDIT_DRAFT_MAX_BYTES,
  createPhoneMovieEditDraft,serializePhoneMovieEditDraft,readPhoneMovieEditDraft,
  verifyPhoneMovieEditDraftMedia,
} from "../src/lib/ai/phoneMovieEditDraft.mjs";

const file=(name,bytes)=>Object.assign(new Blob([bytes]),{name});
const one=file("owner.MOV","private camera scene one");
const two=file("portrait.mp4","original private scene two");
const clips=[one,two];
const sourceRecord=f=>({
  filename:f.name,bytes:f.size,
  sha256:createHash("sha256").update(Buffer.from(f.name==="owner.MOV"?
    "private camera scene one":"original private scene two")).digest("hex"),
});
const shot=(name,caption="",rights="",start=0,frames=16)=>({
  source_filename:name,frames,caption,rights_ref:rights,
  start_seconds:start,fade_in_frames:4,fade_out_frames:0,
});
const plan=(override={})=>({
  profile:"landscape",quality:"cinematic",delivery:"all",framing:"cover",
  shots:[shot(one.name,"","",1,32),shot(two.name,"My human caption","recording owner",0,16)],
  ...override,
});
test("WIP 24FPS draft stores exact media SHA-256 fingerprints, all edit controls and NO source bytes",async()=>{
  const made=await createPhoneMovieEditDraft({files:clips,start:0,seconds:4,moviePlan:plan()});
  assert.equal(made.filename,PHONE_MOVIE_EDIT_DRAFT_NAME);
  assert.equal(made.fps,24);
  assert.equal(made.draft.contains_private_media,false);
  assert.equal(made.draft.originals.length,2);
  assert.equal(made.draft.originals[0].sha256,sourceRecord(one).sha256);
  assert.equal(made.draft.originals[1].sha256,sourceRecord(two).sha256);
  assert.ok(!made.json.includes("private camera scene one"));
  assert.ok(!made.json.includes("original private scene two"));
  assert.ok(!made.json.includes("base64"));
  assert.ok(!made.json.includes("blob:"));
  assert.ok(made.json.length<PHONE_MOVIE_EDIT_DRAFT_MAX_BYTES);
  assert.deepEqual(readPhoneMovieEditDraft(made.json),made.draft);
  assert.equal(made.draft.movie_plan.shots[0].caption,"");
  assert.equal(made.draft.movie_plan.shots[0].rights_ref,"");
  assert.equal(made.draft.movie_plan.shots[0].start_seconds,1);
  assert.equal(made.draft.movie_plan.shots[0].fade_in_frames,4);
  assert.equal(made.draft.movie_plan.quality,"cinematic");
});
test("source reorder is tolerated but EVERY original bytes and filename must be exact before restore",async()=>{
  const original=await createPhoneMovieEditDraft({files:clips,start:0,seconds:4,moviePlan:plan()});
  const seen=[];
  const restored=await verifyPhoneMovieEditDraftMedia(original.draft,[two,one],step=>seen.push(step.checked));
  assert.equal(restored.verifiedCount,2);
  assert.equal(restored.fps,24);
  assert.deepEqual(restored.files,clips);
  assert.equal(restored.privateMediaUploaded,false);
  assert.deepEqual(seen,[1,2]);
  assert.deepEqual(restored.moviePlan.shots,original.draft.movie_plan.shots);
  const equalSizeWrong=file(one.name,"x".repeat(one.size));
  const renamed=file("Owner.MOV","private camera scene one");
  for(const rejected of [[one],[one,two,one],[one,one],[one,equalSizeWrong],
    [equalSizeWrong,two],[renamed,two],[file("evil.mp4","hack"),two]]){
    await assert.rejects(()=>verifyPhoneMovieEditDraftMedia(original.draft,rejected),
      /original|Original|reattach|Reattach/i);
  }
  const verifiedAgain=await verifyPhoneMovieEditDraftMedia(original.draft,[one,two]);
  assert.equal(verifiedAgain.verifiedCount,2);
});
test("versioned schema rejects forged FPS, paths, injection, source overlap and invalid windows",async()=>{
  const good=(await createPhoneMovieEditDraft({files:clips,start:0,seconds:4,moviePlan:plan()})).draft;
  const mutation=[
    draft=>draft.fps=16,
    draft=>draft.version=2,
    draft=>draft.format="another-project",
    draft=>draft.contains_private_media=true,
    draft=>draft.userToken="secret",
    draft=>draft.originals[0].filename="../outside.mov",
    draft=>draft.originals[0].bytes=0,
    draft=>draft.originals[0].sha256="a".repeat(63),
    draft=>draft.originals[1].filename="OWNER.mov",
    draft=>draft.movie_plan.output_url="https://example.invalid",
    draft=>draft.movie_plan.quality="gpu",
    draft=>draft.movie_plan.shots.reverse(),
    draft=>draft.movie_plan.shots[0].start_seconds=3,
    draft=>draft.movie_plan.shots[0].fade_in_frames=9,
    draft=>draft.movie_plan.shots[0].rights_ref="bad\nmalicious",
    draft=>draft.movie_plan.shots[0].secret="private",
    draft=>draft.movie_plan.shots[0].frames=36,
    draft=>draft.seconds=0,
    draft=>draft.start_seconds=-1,
    draft=>draft.originals.push(...Array(7).fill(draft.originals[0])),
  ];
  for(const fn of mutation){
    const edited=structuredClone(good);fn(edited);
    assert.throws(()=>readPhoneMovieEditDraft(JSON.stringify(edited)));
  }
  for(const invalid of ["{","[]",null," ".repeat(PHONE_MOVIE_EDIT_DRAFT_MAX_BYTES+1)]){
    assert.throws(()=>readPhoneMovieEditDraft(invalid));
  }
});
test("16FPS and 24FPS use independent truthful metadata; old movie mode remains accepted",()=>{
  const originals=clips.map(sourceRecord);
  const a=serializePhoneMovieEditDraft({
    originals,start:0,seconds:3,moviePlan:plan({quality:"standard"}),
  });
  const b=serializePhoneMovieEditDraft({
    originals,start:0,seconds:3,moviePlan:plan({quality:"cinematic"}),
  });
  assert.equal(a.draft.fps,16);
  assert.equal(b.draft.fps,24);
  assert.equal(a.draft.movie_plan.quality,"standard");
  assert.equal(b.draft.movie_plan.quality,"cinematic");
  assert.equal(a.draft.movie_plan.shots[0].frames,32);
  assert.equal(b.draft.movie_plan.shots[0].frames,32);
});
test("Studio save/reopen route is real and blocked on failed original SHA256 checks",()=>{
  const ui=readFileSync(new URL("../src/components/LocalVideoImportPrep.tsx",import.meta.url),"utf8");
  const intake=readFileSync(new URL("../src/lib/ai/portablePhoneIntake.mjs",import.meta.url),"utf8");
  for(const pattern of [
    /createPhoneMovieEditDraft/,/readPhoneMovieEditDraft/,/verifyPhoneMovieEditDraftMedia/,
    /setPendingMovieDraft/,/setOriginals\(verified.files\)/,/setMovieTrimSeconds/,
    /setMovieFadeInFrames/,/setMovieQuality/,/setMovieCaptions/,
    /Save editable 16\/24 FPS movie draft/,/Reattach exact original phone recordings/,
    /currentMoviePlan\(\)/,
  ])assert.match(ui,pattern);
  assert.match(intake,/path:"phone-movie-edit-draft\.json"/);
  assert.match(intake,/serializePhoneMovieEditDraft/);
  assert.doesNotMatch(ui,/supabase\.functions\.invoke|enqueueAIJob|localStorage\.setItem/);
});
