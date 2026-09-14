import {removeBackground} from "@imgly/background-removal";

let sessionAttempt = 0;
self.onmessage = async (event: MessageEvent<{image: Blob; publicPath: string}>) => {
  try {
    const output = await removeBackground(event.data.image, {
      publicPath: event.data.publicPath, model: "isnet_quint8", device: "cpu", rescale: true,
      output: {format: "image/x-rgba8"},
      fetchArgs: {cache: "force-cache", headers: {"X-Photo-Session": String(sessionAttempt)}},
      progress: (key, current, total) => self.postMessage({type: "progress", key, current, total}),
    });
    const pixels = await output.arrayBuffer();
    self.postMessage({type: "result", pixels}, {transfer: [pixels]});
  } catch (error) {
    // Failed initialization is memoized by the library; a new key allows retry.
    sessionAttempt++;
    self.postMessage({type: "error", message: error instanceof Error ? error.message : String(error)});
  }
};
