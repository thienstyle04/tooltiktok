// Avoid JSZip's final contiguous Uint8Array copy for large photo archives.
// This still holds the archive in memory; it is not streaming to disk.
export function generateExportZip(zip, onProgress) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let lastUpdate = -Infinity;
    let latest = { percent: 0 };
    const stream = zip.generateInternalStream({ type: 'uint8array', compression: 'STORE', streamFiles: true });
    stream.on('data', (chunk, metadata) => {
      chunks.push(chunk);
      latest = metadata;
      const now = Date.now();
      if (now - lastUpdate >= 150) {
        lastUpdate = now;
        onProgress?.(metadata);
      }
    });
    stream.on('error', error => { chunks = []; reject(error); });
    stream.on('end', () => {
      try {
        const blob = new Blob(chunks, { type: 'application/zip' });
        chunks = [];
        onProgress?.({ ...latest, percent: 100 });
        resolve(blob);
      } catch (error) { chunks = []; reject(error); }
    });
    stream.resume();
  });
}
