export function terrainAddress(point,header){
  if(!Number.isFinite(point.lon)||!Number.isFinite(point.lat)||point.lon<header.minLon||point.lon>header.maxLon||point.lat<header.minLat||point.lat>header.maxLat||Math.abs(point.lat)>85.05112878)return null;
  const z=Math.min(12,header.maxZoom),n=2**z,radians=point.lat*Math.PI/180;
  const u=(point.lon+180)/360*n,v=(1-Math.asinh(Math.tan(radians))/Math.PI)/2*n;
  const x=Math.min(n-1,Math.max(0,Math.floor(u))),y=Math.min(n-1,Math.max(0,Math.floor(v)));
  return {z,x,y,u:Math.min(1,Math.max(0,u-x)),v:Math.min(1,Math.max(0,v-y))};
}
export function sampleDem(tile,address){
  const x=Math.max(0,Math.min(tile.width-1,address.u*tile.width-.5)),y=Math.max(0,Math.min(tile.height-1,address.v*tile.height-.5));
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,tile.width-1),y1=Math.min(y0+1,tile.height-1),dx=x-x0,dy=y-y0;
  const values=[tile.data[y0*tile.width+x0],tile.data[y0*tile.width+x1],tile.data[y1*tile.width+x0],tile.data[y1*tile.width+x1]];
  if(!values.every(Number.isFinite))return null;
  return values[0]*(1-dx)*(1-dy)+values[1]*dx*(1-dy)+values[2]*(1-dx)*dy+values[3]*dx*dy;
}
