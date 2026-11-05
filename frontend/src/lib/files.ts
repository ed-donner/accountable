/** A file's bytes as base64 text, as JSON carries a file, such as the logo. */
export async function base64Of(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // In pieces, since spreading a whole file's bytes into one call can pass the engine's limit on arguments.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/** A picture's size in pixels, read by the browser from the address of its file. */
export function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The browser couldn't read that image."));
    image.src = url;
  });
}
