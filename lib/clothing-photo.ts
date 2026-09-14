/// <reference types="vite/client" />
import PhotoWorker from "./clothing-photo.worker?worker";

export type PhotoProgress = (message: string) => void;
export type PhotoBounds = {left: number; top: number; width: number; height: number};

// A segmentation confidence is not the garment's physical transparency.
// Make the foreground solid while retaining a soft transition at its edges.
// Respect any transparency already present in the original PNG/WebP.
export function refineForegroundAlpha(pixels: Uint8ClampedArray, original: Uint8ClampedArray): void {
  for (let i = 3; i < pixels.length; i += 4) {
    const confidence = Math.max(0, Math.min(1, (pixels[i] - 16) / 112));
    const alpha = Math.round(255 * confidence * confidence * (3 - 2 * confidence));
    pixels[i] = Math.min(original[i], alpha);
  }
}

// Discard only tiny detached mask islands; connected details such as laces
// remain part of the garment, regardless of their thickness.
export function removeMaskSpeckles(pixels: Uint8ClampedArray, width: number, height: number): void {
  const total=width*height;
  const visited=new Uint8Array(total);
  const queue=new Int32Array(total);
  const minimum=Math.max(4,Math.round(total*0.0005));
  for(let start=0;start<total;start++){
    if(visited[start]||pixels[start*4+3]<=8)continue;
    let read=0,count=1;queue[0]=start;visited[start]=1;
    while(read<count){
      const index=queue[read++],x=index%width,y=Math.floor(index/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if((dx===0&&dy===0)||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
        const next=index+dy*width+dx;
        if(!visited[next]&&pixels[next*4+3]>8){visited[next]=1;queue[count++]=next}
      }
    }
    if(count<minimum)for(let i=0;i<count;i++)pixels[queue[i]*4+3]=0;
  }
}

// Read the alpha channel so that light and white clothing remains foreground.
export function foregroundBounds(pixels: Uint8ClampedArray, width: number, height: number): PhotoBounds | null {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  const padding = Math.max(2, Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.03));
  left = Math.max(0, left - padding); top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding); bottom = Math.min(height - 1, bottom + padding);
  return {left, top, width: right - left + 1, height: bottom - top + 1};
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob); else reject(new Error("Не удалось подготовить фотографию."));
  }, "image/png"));
}

let queued: Promise<unknown> = Promise.resolve();
let activeProgress: PhotoProgress | undefined;
let worker: Worker | undefined;
const reportProgress = (key: string, current: number, total: number) => {
  if (key.startsWith("fetch:")) {
    const percent = total ? Math.round(current / total * 100) : 0;
    activeProgress?.(`Готовим обработку фото… ${percent}%`);
  } else if (key === "compute:encode") activeProgress?.("Подготавливаем результат…");
  else activeProgress?.("Удаляем фон…");
};

export function removeClothingBackground(file: File, progress?: PhotoProgress): Promise<File> {
  const task = queued.then(async () => {
    activeProgress = progress;
    progress?.("Подготавливаем фото…");
    const bitmap = await createImageBitmap(file, {imageOrientation: "from-image"});
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", {willReadFrequently: true});
    if (!context) { bitmap.close(); throw new Error("Не удалось подготовить фотографию."); }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const originalPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const normalized = await canvasBlob(canvas);
    worker ??= new PhotoWorker();
    const pixels = new Uint8ClampedArray(await new Promise<ArrayBuffer>((resolve, reject) => {
      const currentWorker = worker!;
      currentWorker.onmessage = event => {
        const message = event.data;
        if (message.type === "progress") reportProgress(message.key, message.current, message.total);
        else if (message.type === "result") resolve(message.pixels);
        else if (message.type === "error") reject(new Error(message.message));
      };
      currentWorker.onerror = event => {
        currentWorker.terminate(); worker = undefined;
        reject(new Error(event.message || "Не удалось запустить обработку фотографии."));
      };
      currentWorker.postMessage({image: normalized, publicPath: new URL("/background-removal/1.7.0/", window.location.origin).href});
    }));
    if (pixels.length !== canvas.width * canvas.height * 4) throw new Error("Не удалось обработать фотографию.");
    refineForegroundAlpha(pixels, originalPixels);
    removeMaskSpeckles(pixels, canvas.width, canvas.height);
    const bounds = foregroundBounds(pixels, canvas.width, canvas.height);
    if (!bounds) throw new Error("Не удалось выделить вещь. Попробуйте другое фото.");
    context.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
    const cropped = document.createElement("canvas");
    cropped.width = bounds.width; cropped.height = bounds.height;
    const croppedContext = cropped.getContext("2d");
    if (!croppedContext) throw new Error("Не удалось подготовить фотографию.");
    croppedContext.drawImage(canvas, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    const output = await canvasBlob(cropped);
    if (output.size > 8 * 1024 * 1024) throw new Error("Обработанное фото слишком большое. Попробуйте другое фото.");
    return new File([output], file.name.replace(/\.[^.]+$/, "") + ".png", {type: "image/png"});
  });
  queued = task.catch(() => undefined).finally(() => { activeProgress = undefined; });
  return task;
}
