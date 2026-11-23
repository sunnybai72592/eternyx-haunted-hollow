/** Safe browser-side v1/v2 offline CPU neural comparison, no inference or uploads. */
export const NEURAL_COMPARISON_LIMITS=Object.freeze({
  maxSources:3,minFrames:32,maxFrames:64,
  maxEpochs:2,maxSeconds:2,maxSeed:2147483647,
  maxReportBytes:65536,maxVideoBytes:64*1024*1024,
});
const HASH=/^[0-9a-f]{64}$/;
const RIGHTS=/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const FILE=/^[^\/\\:\x00-\x1f\x7f]{1,180}\.mp4$/i;
const POSITIVE=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
function whole(v,low,high,desc){
  if(!Number.isSafeInteger(v)||v<low||v>high)
    throw new Error(desc+" must be an integer "+low+"–"+high+".");
}
export function neuralComparisonCommand({
  rightsRef="owner-reviewed-video",seed=42,epochs=1,seconds=1,
}={}){
  if(typeof rightsRef!=="string"||!RIGHTS.test(rightsRef))
    throw new Error("Rights reference must be 1–80 shell-safe letters, numbers, hyphens or underscores.");
  whole(seed,0,NEURAL_COMPARISON_LIMITS.maxSeed,"Comparison seed");
  whole(epochs,1,NEURAL_COMPARISON_LIMITS.maxEpochs,"Training epochs");
  whole(seconds,1,NEURAL_COMPARISON_LIMITS.maxSeconds,"Sample duration");
  return "python gpu-worker/compare_cpu_neural_video.py --input ./local-video-media --output ./eternyx-neural-comparison --rights-ref "+
    rightsRef+" --seed "+seed+" --epochs "+epochs+" --seconds "+seconds;
}
export function neuralComparisonOutputPaths(){
  return Object.freeze({
    report:"eternyx-neural-comparison/comparison-report.json",
    v1:"eternyx-neural-comparison/sample-v1/render/video.mp4",
    v2:"eternyx-neural-comparison/sample-v2/render/video.mp4",
    comparison:"eternyx-neural-comparison/comparison.mp4",
  });
}
export function readNeuralComparisonReport(raw){
  if(typeof raw!=="string"||new TextEncoder().encode(raw).length>NEURAL_COMPARISON_LIMITS.maxReportBytes)
    throw new Error("Choose a comparison-report.json no larger than 64 KiB.");
  let r;
  try{r=JSON.parse(raw);}catch{throw new Error("Invalid CPU neural comparison JSON.");}
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.kind!=="cpu_neural_v1_v2_comparison"||r.version!==1||
     r.neural_network!==true||r.text_to_video!==false||
     r.model_generation!==true||r.same_training_sources!==true||
     r.fps!==16||!Number.isSafeInteger(r.seed)||r.seed<0||
     r.seed>NEURAL_COMPARISON_LIMITS.maxSeed||
     !Number.isSafeInteger(r.epochs)||r.epochs<1||r.epochs>2||
     !Number.isSafeInteger(r.seconds)||r.seconds<1||r.seconds>2||
     !Array.isArray(r.sources)||r.sources.length<1||r.sources.length>3)
    throw new Error("Unsupported genuine CPU neural v1/v2 comparison report.");
  const names=new Set();
  for(const row of r.sources){
    if(!row||typeof row!=="object"||typeof row.file!=="string"||
       !FILE.test(row.file)||row.file.startsWith(".")||row.file.startsWith("~")||
       !HASH.test(row.sha256)||!Number.isSafeInteger(row.actual_frames)||
       row.actual_frames<32||names.has(row.file.toLowerCase()))
      throw new Error("Invalid actual same-source video provenance.");
    names.add(row.file.toLowerCase());
  }
  const evalr=r.evaluation;
  if(!evalr||typeof evalr!=="object"||evalr.version!==1||
     evalr.resolution!=="48x28"||evalr.same_sources!==true||
     evalr.teacher_forcing!==false||
     !Array.isArray(evalr.steps)||evalr.steps.length!==8||
     !evalr.windows||typeof evalr.windows!=="object")
    throw new Error("Missing measured fair eight-step causal evaluation.");
  for(const [index,step] of evalr.steps.entries()){
    if(!step||step.step!==index+1||step.source_count!==r.sources.length||
       !["v1_mse","v2_mse","static_baseline_mse"].every(k=>POSITIVE(step[k])&&step[k]<=1))
      throw new Error("Malformed or unsupported matched causal prediction metrics.");
  }
  for(const n of [1,4,8]){
    const window=evalr.windows[String(n)];
    if(!window||window.steps!==n||
       !["v1_mse","v2_mse","static_baseline_mse"].every(k=>POSITIVE(window[k])&&
         Math.abs(window[k]-
           evalr.steps.slice(0,n).reduce((sum,x)=>sum+x[k],0)/n)<2e-8))
      throw new Error("Eight-step window summary disagrees with raw measured steps.");
  }
  const times=r.cpu_elapsed_seconds;
  if(!times||typeof times!=="object"||
     !["v1_training","v2_training","matched_evaluation","v1_sample_and_render",
       "v2_sample_and_render","side_by_side_encoding"].every(k=>POSITIVE(times[k])))
    throw new Error("Comparison missing real measured CPU wall-clock times.");
  const artifacts=r.artifacts;
  if(!artifacts||typeof artifacts!=="object")throw new Error("Missing real MP4 artifact receipts.");
  for(const version of ["v1","v2"]){
    const row=artifacts[version],resolution=version==="v1"?"32x18":"48x28";
    if(!row||typeof row!=="object"||
       row.model_file!=="model-"+version+"/model.json"||
       row.training_report_file!=="model-"+version+"/training-report.json"||
       row.sample_file!=="sample-"+version+"/render/video.mp4"||
       row.learned_resolution!==resolution||
       !HASH.test(row.model_sha256)||!HASH.test(row.sample_sha256)||
       !HASH.test(row.sample_origin_receipt_sha256)||
       !Number.isSafeInteger(row.model_bytes)||row.model_bytes<1||
       row.model_bytes>131072||
       !Number.isSafeInteger(row.sample_bytes)||row.sample_bytes<1||
       row.sample_bytes>NEURAL_COMPARISON_LIMITS.maxVideoBytes||
       row.sample_frames!==r.seconds*16||
       row.training_source_count!==r.sources.length)
      throw new Error("Malformed or mismatched v1/v2 MP4 provenance.");
  }
  const pair=artifacts.comparison;
  if(!pair||pair.file!=="comparison.mp4"||!HASH.test(pair.sha256)||
     pair.width!==512||pair.height!==144||pair.frame_count!==r.seconds*16||
     !Number.isSafeInteger(pair.video_bytes)||pair.video_bytes<1||
     pair.video_bytes>NEURAL_COMPARISON_LIMITS.maxVideoBytes)
    throw new Error("Missing real 512x144 side-by-side H264 receipt.");
  return r;
}
export function matchNeuralComparisonVideo(report,file){
  if(!report||!file||
     !Number.isSafeInteger(file.size)||file.size<1||
     file.size>NEURAL_COMPARISON_LIMITS.maxVideoBytes||
     typeof file.sha256!=="string"||!HASH.test(file.sha256))
    throw new Error("Choose a real bounded local MP4 file and compute its SHA-256.");
  const candidates=[
    {key:"v1",name:"video.mp4",sha256:report.artifacts.v1.sample_sha256,
      bytes:report.artifacts.v1.sample_bytes},
    {key:"v2",name:"video.mp4",sha256:report.artifacts.v2.sample_sha256,
      bytes:report.artifacts.v2.sample_bytes},
    {key:"comparison",name:"comparison.mp4",sha256:report.artifacts.comparison.sha256,
      bytes:report.artifacts.comparison.video_bytes},
  ];
  const matched=candidates.find(row=>row.sha256===file.sha256&&
    row.bytes===file.size&&row.name===file.name);
  if(!matched)throw new Error("Actual MP4 bytes do not match the self-reported V1/V2 comparison receipt.");
  return {matched:true,kind:matched.key,sha256:matched.sha256,
    width:matched.key==="comparison"?512:256,
    height:144,frames:report.seconds*16,
    interpretation:"A local, self-attested file match—not a quality ranking or signed authenticity."};
}
