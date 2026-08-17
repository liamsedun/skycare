// Square-crop + resize a photo file to a base64 data URL (LB parity for
// patient/dependant avatars). Returns a `data:image/jpeg;base64,...` URL with
// the shortest side squared, max 512px, and enforces a 2 MB upload cap.

const MAX_BYTES = 2 * 1024 * 1024;

export function fileToSquareImage(file: File, maxSide = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file"));
      return;
    }
    if (file.size > MAX_BYTES) {
      reject(new Error("Photo must be 2 MB or smaller"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.width, img.height);
        const scale = Math.min(1, maxSide / side);
        const size = Math.round(side * scale);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process the photo"));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          size,
          size
        );
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Could not process the photo"));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}