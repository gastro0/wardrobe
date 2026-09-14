import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

// Test mask refinement without loading a browser or the inference model.
const source=fs.readFileSync("lib/clothing-photo.ts","utf8").replace(/^import PhotoWorker from .*;$/m, "");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {refineForegroundAlpha,removeMaskSpeckles,foregroundBounds}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const mask=new Uint8ClampedArray([
  255,255,255,0, 255,255,255,12, 240,230,220,64,
  80,60,40,128, 30,20,10,200, 255,255,255,255,
]);
const original=new Uint8ClampedArray(mask);
for(let i=3;i<original.length;i+=4)original[i]=255;
refineForegroundAlpha(mask,original);
assert.equal(mask[3],0);
assert.equal(mask[7],0,"Faint background noise should stay transparent");
assert.ok(mask[11]>0&&mask[11]<255,"Keep a soft boundary");
assert.equal(mask[15],255,"Medium-confidence garment interior must not become see-through");
assert.equal(mask[19],255);
assert.equal(mask[23],255,"White clothing must remain opaque");
for(let i=0;i<mask.length;i++)if(i%4!==3)assert.equal(mask[i],original[i],"Do not change garment colors");
const transparentSource=new Uint8ClampedArray([255,255,255,0, 100,100,100,90]);
const confidentMask=new Uint8ClampedArray([255,255,255,255, 100,100,100,255]);
refineForegroundAlpha(confidentMask,transparentSource);
assert.equal(confidentMask[3],0,"Do not resurrect transparent source pixels");
assert.equal(confidentMask[7],90,"Preserve genuine source transparency");
assert.equal(foregroundBounds(new Uint8ClampedArray(16),2,2),null);
const islands=new Uint8ClampedArray(100*100*4);
for(let y=30;y<70;y++)for(let x=30;x<70;x++)islands[(y*100+x)*4+3]=255;
// A one-pixel-wide connected lace, and a separate substantial clothing part.
for(let x=70;x<90;x++)islands[(50*100+x)*4+3]=255;
for(let y=80;y<85;y++)for(let x=30;x<35;x++)islands[(y*100+x)*4+3]=255;
islands[(5*100+5)*4+3]=255;
removeMaskSpeckles(islands,100,100);
assert.equal(islands[(5*100+5)*4+3],0,"Remove isolated background speckles");
assert.equal(islands[(50*100+89)*4+3],255,"Preserve thin connected laces");
assert.equal(islands[(82*100+32)*4+3],255,"Preserve larger disconnected parts");
console.log("PASS: solid garment interiors, soft edges, original transparency and unchanged colors");
