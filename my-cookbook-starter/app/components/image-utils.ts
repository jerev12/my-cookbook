// Utility helpers for cropping/resizing images in the browser using canvas

export async function fileToImage(file: File): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = URL.createObjectURL(file);
  await new Promise((res, rej) => {
    img.onload = () => res(null);
    img.onerror = (e) => rej(e);
  });
  return img;
}

export function getCroppedImageDataURL(
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
  outputSize = 512
): string {
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    crop.x, crop.y, crop.width, crop.height, // from source
    0, 0, outputSize, outputSize             // to canvas
  );

  return canvas.toDataURL('image/png'); // outputs a base64 PNG
}

export async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}
