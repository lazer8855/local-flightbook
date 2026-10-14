const stops = [[-3, [33,102,172]],[-0.2,[117,181,223]],[0,[139,144,149]],[0.2,[242,186,112]],[3,[216,90,25]]];
export function rateRGB(rate) {
  if (!Number.isFinite(rate)) return stops[2][1].map(v => v / 255);
  for (let i = 1; i < stops.length; i++) if (rate <= stops[i][0]) {
    const [lo, a] = stops[i - 1], [hi, b] = stops[i];
    const t = Math.max(0, Math.min(1, (rate - lo) / (hi - lo)));
    return a.map((v, j) => (v + (b[j] - v) * t) / 255);
  }
  return stops.at(-1)[1].map(v => v / 255);
}

export function flightMesh(points, rates, project) {
  const first = points.find(p => Number.isFinite(p.gpsAltitude));
  const origin = first ? project(first) : [0,0,0];
  const vertices = [];
  let segments = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    if (![points[i].gpsAltitude, points[i + 1].gpsAltitude].every(Number.isFinite)) continue;
    const a = project(points[i]).map((v,j) => v - origin[j]);
    const b = project(points[i + 1]).map((v,j) => v - origin[j]);
    const color = rateRGB(rates[i]?.properties.rate);
    for (const corner of [[0,-1],[1,-1],[0,1],[0,1],[1,-1],[1,1]]) vertices.push(...a,...b,...corner,...color);
    segments++;
  }
  return { origin, vertices: new Float32Array(vertices), segments };
}

export function flight3DLayer(maplibre) {
  return {
    id: 'flight-3d', type: 'custom', renderingMode: '3d', segments: 0, frames: 0,
    onAdd(map, gl) {
      this.map = map;
      const shader = (type, source) => {
        const result = gl.createShader(type); gl.shaderSource(result, source); gl.compileShader(result);
        if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(result); gl.deleteShader(result); throw new Error(message); }
        return result;
      };
      const vertex = shader(gl.VERTEX_SHADER, `precision highp float;
        attribute vec3 a_start; attribute vec3 a_end; attribute vec2 a_corner; attribute vec3 a_color;
        uniform mat4 u_matrix; uniform vec2 u_viewport; varying vec3 v_color;
        void main(){
          vec4 a=u_matrix*vec4(a_start,1.0), b=u_matrix*vec4(a_end,1.0);
          vec2 delta=(b.xy/max(b.w,0.00001)-a.xy/max(a.w,0.00001))*u_viewport;
          vec2 normal=vec2(-delta.y,delta.x)/max(length(delta),0.00001);
          vec4 p=mix(a,b,a_corner.x);
          p.xy+=normal*a_corner.y*4.0/u_viewport*p.w;
          gl_Position=p; v_color=a_color;
        }`);
      const fragment = shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec3 v_color; void main(){gl_FragColor=vec4(v_color,1.0);}');
      this.program=gl.createProgram(); gl.attachShader(this.program,vertex); gl.attachShader(this.program,fragment); gl.linkProgram(this.program);
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      this.buffer=gl.createBuffer(); this.vao=gl.createVertexArray();
      gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      for (const [name,size,offset] of [['a_start',3,0],['a_end',3,12],['a_corner',2,24],['a_color',3,32]]) {
        const location=gl.getAttribLocation(this.program,name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,size,gl.FLOAT,false,44,offset);
      }
      gl.bindVertexArray(null);
      this.matrix=gl.getUniformLocation(this.program,'u_matrix'); this.viewport=gl.getUniformLocation(this.program,'u_viewport');
    },
    setFlight(points, rates) {
      const mesh=flightMesh(points,rates,p => { const c=maplibre.MercatorCoordinate.fromLngLat([p.lon,p.lat],p.gpsAltitude); return [c.x,c.y,c.z]; });
      this.origin=mesh.origin; this.segments=mesh.segments; this.pending=mesh.vertices; this.map?.triggerRepaint();
    },
    render(gl, args) {
      if (!this.segments) return;
      gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      if (this.pending) { gl.bufferData(gl.ARRAY_BUFFER,this.pending,gl.STATIC_DRAW); this.pending=null; }
      const m=args.defaultProjectionData.mainMatrix, matrix=new Float32Array(m), [x,y,z]=this.origin;
      for(let i=0;i<4;i++) matrix[12+i]=m[i]*x+m[4+i]*y+m[8+i]*z+m[12+i];
      gl.useProgram(this.program); gl.uniformMatrix4fv(this.matrix,false,matrix); gl.uniform2f(this.viewport,gl.drawingBufferWidth,gl.drawingBufferHeight);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLES,0,this.segments*6); gl.bindVertexArray(null); this.frames++;
    },
    onRemove(map,gl) { gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program); }
  };
}
