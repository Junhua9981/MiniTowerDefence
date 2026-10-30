// 手寫 WebGL2 渲染器：所有形狀用 instanced rendering + SDF 片段著色器，一次繪製。
// 形狀編號
export const S_BOX = 0, S_TRI = 1, S_DIAMOND = 2, S_HEX = 3, S_STAR = 4, S_CIRCLE = 5,
  S_RING = 6, S_CAPSULE = 7, S_GLOW = 8, S_DASHBOX = 9, S_ROUNDBOX = 10;

const FLOATS = 8; // x y w h rot shape fill edge（後兩個是打包的 RGBA8）

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_quad;
layout(location=1) in vec4 a_xywh;
layout(location=2) in vec2 a_rs;
layout(location=3) in vec4 a_fill;
layout(location=4) in vec4 a_edge;
uniform vec4 u_view;
uniform float u_pad;
out vec2 v_local;
out vec2 v_half;
flat out int v_shape;
out vec4 v_fill;
out vec4 v_edge;
void main(){
  vec2 hs = a_xywh.zw * 0.5;
  vec2 ext = hs + vec2(u_pad);
  vec2 l = a_quad * ext;
  float c = cos(a_rs.x), s = sin(a_rs.x);
  vec2 w = a_xywh.xy + vec2(l.x*c - l.y*s, l.x*s + l.y*c);
  gl_Position = vec4(w * u_view.xy + u_view.zw, 0.0, 1.0);
  v_local = l; v_half = hs; v_shape = int(a_rs.y + 0.5); v_fill = a_fill; v_edge = a_edge;
}`;

const FS = `#version 300 es
precision highp float;
in vec2 v_local;
in vec2 v_half;
flat in int v_shape;
in vec4 v_fill;
in vec4 v_edge;
uniform float u_edgeW;
out vec4 o;
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdTri(vec2 p, float r){
  const float k = 1.7320508;
  p.x = abs(p.x) - r; p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float ndot(vec2 a, vec2 b){ return a.x*b.x - a.y*b.y; }
float sdRhombus(vec2 p, vec2 b){
  p = abs(p);
  float h = clamp(ndot(b - 2.0*p, b) / dot(b, b), -1.0, 1.0);
  float d = length(p - 0.5*b*vec2(1.0 - h, 1.0 + h));
  return d * sign(p.x*b.y + p.y*b.x - b.x*b.y);
}
float sdHex(vec2 p, float r){
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z*r, k.z*r), r);
  return length(p) * sign(p.y);
}
float sdStar5(vec2 p, float r, float rf){
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba*h) * sign(p.y*ba.x - p.x*ba.y);
}
void main(){
  vec2 p = v_local;
  float h = min(v_half.x, v_half.y);
  float d;
  if (v_shape == 0) d = sdBox(p, v_half);
  else if (v_shape == 1) d = sdTri(vec2(-p.y, p.x), h * 0.86);
  else if (v_shape == 2) d = sdRhombus(p, v_half);
  else if (v_shape == 3) d = sdHex(p, h * 0.9);
  else if (v_shape == 4) d = sdStar5(vec2(p.x, -p.y), h, 0.45);
  else if (v_shape == 5) d = length(p) - h;
  else if (v_shape == 6) { float t = max(u_edgeW * 0.75, min(h * 0.04, 0.07)); d = abs(length(p) - (h - t)) - t; }
  else if (v_shape == 7) { float r = v_half.y; vec2 q = p; q.x -= clamp(q.x, -(v_half.x - r), v_half.x - r); d = length(q) - r; }
  else if (v_shape == 8) {
    float g = clamp(1.0 - length(p) / h, 0.0, 1.0);
    o = vec4(v_fill.rgb, v_fill.a * g * g);
    if (o.a < 0.003) discard;
    return;
  }
  else if (v_shape == 9) {
    // 虛線框（藍圖 / 殘影）
    d = abs(sdBox(p, v_half - u_edgeW)) - u_edgeW * 0.6;
    float along = (abs(p.x) > abs(p.y) * (v_half.x / v_half.y)) ? p.y : p.x;
    if (fract(along * 3.0) > 0.55) d = 1.0;
  }
  else { float rr = h * 0.22; d = sdBox(p, v_half - rr) - rr; }
  float aa = max(fwidth(d), 1e-4);
  float cov = 1.0 - smoothstep(-aa, aa, d);
  if (cov <= 0.0) discard;
  float e = smoothstep(-u_edgeW - aa, -u_edgeW + aa, d) * v_edge.a;
  vec3 col = mix(v_fill.rgb, v_edge.rgb, e);
  float a = max(v_fill.a, e) * cov;
  o = vec4(col, a);
}`;

const GRID_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_quad;
uniform vec4 u_view;
uniform vec2 u_size;
out vec2 v_w;
void main(){
  vec2 w = (a_quad * 0.5 + 0.5) * u_size;
  v_w = w;
  gl_Position = vec4(w * u_view.xy + u_view.zw, 0.0, 1.0);
}`;
const GRID_FS = `#version 300 es
precision highp float;
in vec2 v_w;
uniform vec3 u_bg;
uniform vec3 u_line;
uniform vec2 u_size;
out vec4 o;
void main(){
  vec2 f = abs(fract(v_w + 0.5) - 0.5) / fwidth(v_w);
  float line = 1.0 - min(min(f.x, f.y), 1.0);
  // 每 10 格加粗一點
  vec2 f10 = abs(fract(v_w / 10.0 + 0.5) - 0.5) * 10.0 / fwidth(v_w);
  float line10 = 1.0 - min(min(f10.x, f10.y) * 0.7, 1.0);
  float fade = clamp(1.0 / (fwidth(v_w.x) * 6.0), 0.0, 1.0);
  vec2 c = v_w / u_size - 0.5;
  float vig = 1.0 - dot(c, c) * 0.35;
  vec3 col = u_bg * vig;
  col = mix(col, u_line, max(line * 0.55 * fade, line10 * 0.8));
  o = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// ── 後製：全螢幕三角形 ──
const POST_VS = `#version 300 es
out vec2 v_uv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
// 取亮部（縮小到 1/4 時順便做 4 點平均）
const BRIGHT_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_thr;
out vec4 o;
void main(){
  vec3 c = texture(u_tex, v_uv + u_texel * vec2(-1.0, -1.0)).rgb + texture(u_tex, v_uv + u_texel * vec2(1.0, -1.0)).rgb
         + texture(u_tex, v_uv + u_texel * vec2(-1.0, 1.0)).rgb + texture(u_tex, v_uv + u_texel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  o = vec4(c * smoothstep(u_thr, u_thr + 0.2, l), 1.0);
}`;
const BLUR_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;
out vec4 o;
void main(){
  vec3 c = texture(u_tex, v_uv).rgb * 0.2270;
  c += (texture(u_tex, v_uv + u_dir * 1.3846).rgb + texture(u_tex, v_uv - u_dir * 1.3846).rgb) * 0.3162;
  c += (texture(u_tex, v_uv + u_dir * 3.2308).rgb + texture(u_tex, v_uv - u_dir * 3.2308).rgb) * 0.0703;
  o = vec4(c, 1.0);
}`;
// 合成：場景 × 光照（夜晚） + bloom
const COMP_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene, u_light, u_bloom;
uniform float u_lightAmt, u_bloomAmt;
uniform vec3 u_amb;
out vec4 o;
void main(){
  vec3 s = texture(u_scene, v_uv).rgb;
  vec3 L = min(u_amb + texture(u_light, v_uv).rgb, vec3(1.5));
  vec3 c = s * mix(vec3(1.0), L, u_lightAmt) + texture(u_bloom, v_uv).rgb * u_bloomAmt;
  o = vec4(c, 1.0);
}`;

function makeTarget(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h };
}
function freeTarget(gl, t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } }

/** 一組實例緩衝（CPU 陣列 + GPU buffer + VAO） */
class InstanceList {
  constructor(gl, quadBuf, cap) {
    this.cap = cap; this.count = 0;
    this.buf = new ArrayBuffer(cap * FLOATS * 4);
    this.f32 = new Float32Array(this.buf); this.u32 = new Uint32Array(this.buf);
    this.gbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gbuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.buf.byteLength, gl.DYNAMIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gbuf);
    const S = FLOATS * 4;
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, S, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, S, 16); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, S, 24); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, S, 28); gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
  }
  push(x, y, w, h, rot, shape, fill, edge) {
    if (this.count >= this.cap) return;
    const o = this.count++ * FLOATS, f = this.f32;
    f[o] = x; f[o + 1] = y; f[o + 2] = w; f[o + 3] = h; f[o + 4] = rot; f[o + 5] = shape;
    this.u32[o + 6] = fill; this.u32[o + 7] = edge;
  }
  draw(gl) {
    if (!this.count) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gbuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.f32, 0, this.count * FLOATS);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }
}

export class Renderer {
  constructor(canvas, capacity = 120000) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('瀏覽器不支援 WebGL2');
    this.gl = gl;

    this.prog = program(gl, VS, FS);
    this.gridProg = program(gl, GRID_VS, GRID_FS);
    this.brightProg = program(gl, POST_VS, BRIGHT_FS);
    this.blurProg = program(gl, POST_VS, BLUR_FS);
    this.compProg = program(gl, POST_VS, COMP_FS);
    const U = (p, n) => gl.getUniformLocation(p, n);
    this.uView = U(this.prog, 'u_view'); this.uPad = U(this.prog, 'u_pad'); this.uEdgeW = U(this.prog, 'u_edgeW');
    this.gView = U(this.gridProg, 'u_view'); this.gSize = U(this.gridProg, 'u_size');
    this.gBg = U(this.gridProg, 'u_bg'); this.gLine = U(this.gridProg, 'u_line');
    this.uB = { tex: U(this.brightProg, 'u_tex'), texel: U(this.brightProg, 'u_texel'), thr: U(this.brightProg, 'u_thr') };
    this.uBl = { tex: U(this.blurProg, 'u_tex'), dir: U(this.blurProg, 'u_dir') };
    this.uC = { scene: U(this.compProg, 'u_scene'), light: U(this.compProg, 'u_light'), bloom: U(this.compProg, 'u_bloom'),
      lightAmt: U(this.compProg, 'u_lightAmt'), bloomAmt: U(this.compProg, 'u_bloomAmt'), amb: U(this.compProg, 'u_amb') };

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    this.main = new InstanceList(gl, this.quadBuf, capacity);
    this.lights = new InstanceList(gl, this.quadBuf, 16384);

    this.gridVao = gl.createVertexArray();
    gl.bindVertexArray(this.gridVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.emptyVao = gl.createVertexArray();

    // 1×1 黑色貼圖：光照或 bloom 關閉時用
    this.black = makeTarget(gl, 1, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.black.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.dpr = 1; this.cssW = 1; this.cssH = 1;
    this.bloomOn = true;      // 自動降級可關
    this.lightDiv = 4;        // 光照貼圖解析度（1/4，降級時 1/8）
    this.targetsKey = '';
  }

  get count() { return this.main.count; }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr || 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w !== this.cssW || h !== this.cssH || dpr !== this.dpr) {
      this.cssW = w; this.cssH = h; this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(w * dpr));
      this.canvas.height = Math.max(1, Math.round(h * dpr));
    }
    const W = this.canvas.width, H = this.canvas.height;
    const key = `${W}x${H}/${this.lightDiv}`;
    if (key !== this.targetsKey) {
      const gl = this.gl;
      for (const t of [this.scene, this.lightT, this.bloomA, this.bloomB]) freeTarget(gl, t);
      this.scene = makeTarget(gl, W, H);
      this.lightT = makeTarget(gl, Math.max(1, Math.ceil(W / this.lightDiv)), Math.max(1, Math.ceil(H / this.lightDiv)));
      const bw = Math.max(1, Math.ceil(W / 4)), bh = Math.max(1, Math.ceil(H / 4));
      this.bloomA = makeTarget(gl, bw, bh);
      this.bloomB = makeTarget(gl, bw, bh);
      this.targetsKey = key;
    }
  }

  begin() { this.main.count = 0; this.lights.count = 0; }

  /** 加入一個形狀實例。fill / edge 是打包好的 RGBA8（見 rgba()）。 */
  push(x, y, w, h, rot, shape, fill, edge) { this.main.push(x, y, w, h, rot, shape, fill, edge); }
  /** 加入一個光源（柔和圓形，畫進低解析度光照貼圖）；color 的 alpha 是強度 */
  light(x, y, size, color) { this.lights.push(x, y, size, size, 0, 8, color, 0); }
  /** 線狀光源（雷射等） */
  lightLine(x, y, len, wdt, rot, color) { this.lights.push(x, y, len, wdt, rot, 7, color, 0); }

  /**
   * cam: {x, y, ppc}（ppc = 每格 CSS 像素）；bg/line/outside: [r,g,b] 0..1
   * post: { lightAmt 0..1, amb [r,g,b], bloomAmt, bloomThr }
   */
  draw(cam, bg, line, mapW, mapH, outside, post) {
    const gl = this.gl;
    const W = this.canvas.width, H = this.canvas.height;
    const sx = 2 * cam.ppc / this.cssW, sy = -2 * cam.ppc / this.cssH;
    const view = [sx, sy, -cam.x * sx, -cam.y * sy];

    // 1) 場景 → FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(outside[0], outside[1], outside[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.gridProg);
    gl.uniform4fv(this.gView, view);
    gl.uniform2f(this.gSize, mapW, mapH);
    gl.uniform3fv(this.gBg, bg);
    gl.uniform3fv(this.gLine, line);
    gl.bindVertexArray(this.gridVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(this.prog);
    gl.uniform4fv(this.uView, view);
    gl.uniform1f(this.uPad, 1.5 / cam.ppc);
    gl.uniform1f(this.uEdgeW, Math.min(0.12, 1.25 / cam.ppc));
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.main.draw(gl);

    // 2) 光照貼圖（只在變暗時）
    const useLight = post.lightAmt > 0.01;
    if (useLight) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightT.fbo);
      gl.viewport(0, 0, this.lightT.w, this.lightT.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(this.uPad, 1.5 / cam.ppc * this.lightDiv);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      this.lights.draw(gl);
    }
    gl.disable(gl.BLEND);

    // 3) bloom：取亮部 → 水平模糊 → 垂直模糊
    const useBloom = this.bloomOn && post.bloomAmt > 0.01;
    gl.bindVertexArray(this.emptyVao);
    if (useBloom) {
      const A = this.bloomA, B = this.bloomB;
      gl.bindFramebuffer(gl.FRAMEBUFFER, A.fbo); gl.viewport(0, 0, A.w, A.h);
      gl.useProgram(this.brightProg);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
      gl.uniform1i(this.uB.tex, 0); gl.uniform2f(this.uB.texel, 1 / W, 1 / H); gl.uniform1f(this.uB.thr, post.bloomThr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(this.blurProg); gl.uniform1i(this.uBl.tex, 0);
      for (let k = 0; k < 2; k++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, B.fbo); gl.bindTexture(gl.TEXTURE_2D, A.tex);
        gl.uniform2f(this.uBl.dir, (1 + k) / A.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, A.fbo); gl.bindTexture(gl.TEXTURE_2D, B.tex);
        gl.uniform2f(this.uBl.dir, 0, (1 + k) / A.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    // 4) 合成到畫面
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.compProg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, useLight ? this.lightT.tex : this.black.tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, useBloom ? this.bloomA.tex : this.black.tex);
    gl.uniform1i(this.uC.scene, 0); gl.uniform1i(this.uC.light, 1); gl.uniform1i(this.uC.bloom, 2);
    gl.uniform1f(this.uC.lightAmt, useLight ? post.lightAmt : 0);
    gl.uniform1f(this.uC.bloomAmt, useBloom ? post.bloomAmt : 0);
    gl.uniform3fv(this.uC.amb, post.amb);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }
}

// ── 顏色工具 ──
export function rgba(r, g, b, a = 1) {
  return ((Math.round(a * 255) << 24) | (Math.round(b * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(r * 255)) >>> 0;
}
export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function pack(c, a = 1) { return rgba(c[0], c[1], c[2], a); }
