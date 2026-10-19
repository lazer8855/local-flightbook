import { PMTiles, FileSource } from 'pmtiles';
import contour from 'maplibre-contour';
import {terrainAddress,sampleDem} from './terrain-sampling.mjs';

let archive, manager, header;
const controllers = new Map();

async function decodeTile(z, x, y, signal) {
  const tile = await archive.getZxy(z, x, y, signal);
  if (!tile) return { width: 512, height: 512, data: new Float32Array(512 * 512).fill(NaN) };
  const image = await createImageBitmap(new Blob([tile.data], { type: 'image/webp' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  try {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, image.width, image.height).data;
    return contour.decodeParsedImage(image.width, image.height, 'terrarium', rgba);
  } finally { image.close(); }
}

self.onmessage = async ({ data: message }) => {
  const { id, type } = message;
  if (type === 'cancel') { controllers.get(id)?.abort(); return; }
  const controller = new AbortController(); controllers.set(id, controller);
  try {
    let result;
    if (type === 'init') {
      archive = new PMTiles(new FileSource(message.file)); header = await archive.getHeader();
      manager = new contour.LocalDemManager({ demUrlPattern: 'local://{z}/{x}/{y}', cacheSize: 32, encoding: 'terrarium', maxzoom: Math.min(12, header.maxZoom), timeoutMs: 30000 });
      // Read browser-selected PMTiles directly. The default manager fetches HTTP,
      // which is deliberately replaced here; decoding and isolines stay in this worker.
      manager.fetchAndParseTile = (z, x, y, abortController) => manager.parsedCache.get(`${z}/${x}/${y}`, (_, childController) => decodeTile(z, x, y, childController.signal), abortController);
      result = { header };
    } else if (type === 'raster') {
      const tile = await archive.getZxy(message.z, message.x, message.y, controller.signal);
      if (!tile) throw new Error('Terrain tile is missing from the selected archive');
      result = { data: tile.data };
    } else if(type==='sample'){
      result=[];
      for(const point of message.points){
        if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
        const address=terrainAddress(point,header);
        if(!address){result.push(null);continue;}
        const tile=await manager.fetchAndParseTile(address.z,address.x,address.y,controller);
        result.push(sampleDem(tile,address));
      }
    } else if (type === 'contours') {
      const tile = await manager.fetchContourTile(message.z, message.x, message.y, { levels: [100, 500], contourLayer: 'contours', elevationKey: 'ele', levelKey: 'level', extent: 4096, buffer: 1, subsampleBelow: 100 }, controller);
      result = { data: tile.arrayBuffer };
    } else throw new Error(`Unknown terrain operation: ${type}`);
    if (!controller.signal.aborted) self.postMessage({ id, result }, result?.data ? [result.data] : []);
  } catch (error) {
    if (!controller.signal.aborted) self.postMessage({ id, error: { name: error.name, message: error.message } });
  } finally { controllers.delete(id); }
};
