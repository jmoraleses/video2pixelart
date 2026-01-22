/**
 * Video to Pixel Art Converter - Simplified Version
 */

// ===== Configuration =====
const CONFIG = {
    defaultBlockSize: 50,
    defaultFps: 12,
    defaultTolerance: 30,
    maxFrames: 5000
};

// Inline worker script to allow running via file:// protocol without local server
const GIF_WORKER_SCRIPT = `// gif.worker.js 0.2.0
(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){var NeuQuant=require("./TypedNeuQuant.js");var LZWEncoder=require("./LZWEncoder.js");function ByteArray(){this.page=-1;this.pages=[];this.newPage()}ByteArray.pageSize=4096;ByteArray.charMap={};for(var i=0;i<256;i++)ByteArray.charMap[i]=String.fromCharCode(i);ByteArray.prototype.newPage=function(){this.pages[++this.page]=new Uint8Array(ByteArray.pageSize);this.cursor=0};ByteArray.prototype.getData=function(){var rv="";for(var p=0;p<this.pages.length;p++){for(var i=0;i<ByteArray.pageSize;i++){rv+=ByteArray.charMap[this.pages[p][i]]}}return rv};ByteArray.prototype.writeByte=function(val){if(this.cursor>=ByteArray.pageSize)this.newPage();this.pages[this.page][this.cursor++]=val};ByteArray.prototype.writeUTFBytes=function(string){for(var l=string.length,i=0;i<l;i++)this.writeByte(string.charCodeAt(i))};ByteArray.prototype.writeBytes=function(array,offset,length){for(var l=length||array.length,i=offset||0;i<l;i++)this.writeByte(array[i])};function GIFEncoder(width,height){this.width=~~width;this.height=~~height;this.transparent=null;this.transIndex=0;this.repeat=-1;this.delay=0;this.image=null;this.pixels=null;this.indexedPixels=null;this.colorDepth=null;this.colorTab=null;this.neuQuant=null;this.usedEntry=new Array;this.palSize=7;this.dispose=-1;this.firstFrame=true;this.sample=10;this.dither=false;this.globalPalette=false;this.out=new ByteArray}GIFEncoder.prototype.setDelay=function(milliseconds){this.delay=Math.round(milliseconds/10)};GIFEncoder.prototype.setFrameRate=function(fps){this.delay=Math.round(100/fps)};GIFEncoder.prototype.setDispose=function(disposalCode){if(disposalCode>=0)this.dispose=disposalCode};GIFEncoder.prototype.setRepeat=function(repeat){this.repeat=repeat};GIFEncoder.prototype.setTransparent=function(color){this.transparent=color};GIFEncoder.prototype.addFrame=function(imageData){this.image=imageData;this.colorTab=this.globalPalette&&this.globalPalette.slice?this.globalPalette:null;this.getImagePixels();this.analyzePixels();if(this.globalPalette===true)this.globalPalette=this.colorTab;if(this.firstFrame){this.writeLSD();this.writePalette();if(this.repeat>=0){this.writeNetscapeExt()}}this.writeGraphicCtrlExt();this.writeImageDesc();if(!this.firstFrame&&!this.globalPalette)this.writePalette();this.writePixels();this.firstFrame=false};GIFEncoder.prototype.finish=function(){this.out.writeByte(59)};GIFEncoder.prototype.setQuality=function(quality){if(quality<1)quality=1;this.sample=quality};GIFEncoder.prototype.setDither=function(dither){if(dither===true)dither="FloydSteinberg";this.dither=dither};GIFEncoder.prototype.setGlobalPalette=function(palette){this.globalPalette=palette};GIFEncoder.prototype.getGlobalPalette=function(){return this.globalPalette&&this.globalPalette.slice&&this.globalPalette.slice(0)||this.globalPalette};GIFEncoder.prototype.writeHeader=function(){this.out.writeUTFBytes("GIF89a")};GIFEncoder.prototype.analyzePixels=function(){if(!this.colorTab){this.neuQuant=new NeuQuant(this.pixels,this.sample);this.neuQuant.buildColormap();this.colorTab=this.neuQuant.getColormap()}if(this.dither){this.ditherPixels(this.dither.replace("-serpentine",""),this.dither.match(/-serpentine/)!==null)}else{this.indexPixels()}this.pixels=null;this.colorDepth=8;this.palSize=7;if(this.transparent!==null){this.transIndex=this.findClosest(this.transparent,true)}};GIFEncoder.prototype.indexPixels=function(imgq){var nPix=this.pixels.length/3;this.indexedPixels=new Uint8Array(nPix);var k=0;for(var j=0;j<nPix;j++){var index=this.findClosestRGB(this.pixels[k++]&255,this.pixels[k++]&255,this.pixels[k++]&255);this.usedEntry[index]=true;this.indexedPixels[j]=index}};GIFEncoder.prototype.ditherPixels=function(kernel,serpentine){var kernels={FalseFloydSteinberg:[[3/8,1,0],[3/8,0,1],[2/8,1,1]],FloydSteinberg:[[7/16,1,0],[3/16,-1,1],[5/16,0,1],[1/16,1,1]],Stucki:[[8/42,1,0],[4/42,2,0],[2/42,-2,1],[4/42,-1,1],[8/42,0,1],[4/42,1,1],[2/42,2,1],[1/42,-2,2],[2/42,-1,2],[4/42,0,2],[2/42,1,2],[1/42,2,2]],Atkinson:[[1/8,1,0],[1/8,2,0],[1/8,-1,1],[1/8,0,1],[1/8,1,1],[1/8,0,2]]};if(!kernel||!kernels[kernel]){throw"Unknown dithering kernel: "+kernel}var ds=kernels[kernel];var index=0,height=this.height,width=this.width,data=this.pixels;var direction=serpentine?-1:1;this.indexedPixels=new Uint8Array(this.pixels.length/3);for(var y=0;y<height;y++){if(serpentine)direction=direction*-1;for(var x=direction==1?0:width-1,xend=direction==1?width:0;x!==xend;x+=direction){index=y*width+x;var idx=index*3;var r1=data[idx];var g1=data[idx+1];var b1=data[idx+2];idx=this.findClosestRGB(r1,g1,b1);this.usedEntry[idx]=true;this.indexedPixels[index]=idx;idx*=3;var r2=this.colorTab[idx];var g2=this.colorTab[idx+1];var b2=this.colorTab[idx+2];var er=r1-r2;var eg=g1-g2;var eb=b1-b2;for(var i=direction==1?0:ds.length-1,end=direction==1?ds.length:0;i!==end;i+=direction){var x1=ds[i][1];var y1=ds[i][2];if(x1+x>=0&&x1+x<width&&y1+y>=0&&y1+y<height){var d=ds[i][0];idx=index+x1+y1*width;idx*=3;data[idx]=Math.max(0,Math.min(255,data[idx]+er*d));data[idx+1]=Math.max(0,Math.min(255,data[idx+1]+eg*d));data[idx+2]=Math.max(0,Math.min(255,data[idx+2]+eb*d))}}}}};GIFEncoder.prototype.findClosest=function(c,used){return this.findClosestRGB((c&16711680)>>16,(c&65280)>>8,c&255,used)};GIFEncoder.prototype.findClosestRGB=function(r,g,b,used){if(this.colorTab===null)return-1;if(this.neuQuant&&!used){return this.neuQuant.lookupRGB(r,g,b)}var c=b|g<<8|r<<16;var minpos=0;var dmin=256*256*256;var len=this.colorTab.length;for(var i=0,index=0;i<len;index++){var dr=r-(this.colorTab[i++]&255);var dg=g-(this.colorTab[i++]&255);var db=b-(this.colorTab[i++]&255);var d=dr*dr+dg*dg+db*db;if((!used||this.usedEntry[index])&&d<dmin){dmin=d;minpos=index}}return minpos};GIFEncoder.prototype.getImagePixels=function(){var w=this.width;var h=this.height;this.pixels=new Uint8Array(w*h*3);var data=this.image;var srcPos=0;var count=0;for(var i=0;i<h;i++){for(var j=0;j<w;j++){this.pixels[count++]=data[srcPos++];this.pixels[count++]=data[srcPos++];this.pixels[count++]=data[srcPos++];srcPos++}}};GIFEncoder.prototype.writeGraphicCtrlExt=function(){this.out.writeByte(33);this.out.writeByte(249);this.out.writeByte(4);var transp,disp;if(this.transparent===null){transp=0;disp=0}else{transp=1;disp=2}if(this.dispose>=0){disp=dispose&7}disp<<=2;this.out.writeByte(0|disp|0|transp);this.writeShort(this.delay);this.out.writeByte(this.transIndex);this.out.writeByte(0)};GIFEncoder.prototype.writeImageDesc=function(){this.out.writeByte(44);this.writeShort(0);this.writeShort(0);this.writeShort(this.width);this.writeShort(this.height);if(this.firstFrame||this.globalPalette){this.out.writeByte(0)}else{this.out.writeByte(128|0|0|0|this.palSize)}};GIFEncoder.prototype.writeLSD=function(){this.writeShort(this.width);this.writeShort(this.height);this.out.writeByte(128|112|0|this.palSize);this.out.writeByte(0);this.out.writeByte(0)};GIFEncoder.prototype.writeNetscapeExt=function(){this.out.writeByte(33);this.out.writeByte(255);this.out.writeByte(11);this.out.writeUTFBytes("NETSCAPE2.0");this.out.writeByte(3);this.out.writeByte(1);this.writeShort(this.repeat);this.out.writeByte(0)};GIFEncoder.prototype.writePalette=function(){this.out.writeBytes(this.colorTab);var n=3*256-this.colorTab.length;for(var i=0;i<n;i++)this.out.writeByte(0)};GIFEncoder.prototype.writeShort=function(pValue){this.out.writeByte(pValue&255);this.out.writeByte(pValue>>8&255)};GIFEncoder.prototype.writePixels=function(){var enc=new LZWEncoder(this.width,this.height,this.indexedPixels,this.colorDepth);enc.encode(this.out)};GIFEncoder.prototype.stream=function(){return this.out};module.exports=GIFEncoder},{"./LZWEncoder.js":2,"./TypedNeuQuant.js":3}],2:[function(require,module,exports){var EOF=-1;var BITS=12;var HSIZE=5003;var masks=[0,1,3,7,15,31,63,127,255,511,1023,2047,4095,8191,16383,32767,65535];function LZWEncoder(width,height,pixels,colorDepth){var initCodeSize=Math.max(2,colorDepth);var accum=new Uint8Array(256);var htab=new Int32Array(HSIZE);var codetab=new Int32Array(HSIZE);var cur_accum,cur_bits=0;var a_count;var free_ent=0;var maxcode;var clear_flg=false;var g_init_bits,ClearCode,EOFCode;function char_out(c,outs){accum[a_count++]=c;if(a_count>=254)flush_char(outs)}function cl_block(outs){cl_hash(HSIZE);free_ent=ClearCode+2;clear_flg=true;output(ClearCode,outs)}function cl_hash(hsize){for(var i=0;i<hsize;++i)htab[i]=-1}function compress(init_bits,outs){var fcode,c,i,ent,disp,hsize_reg,hshift;g_init_bits=init_bits;clear_flg=false;n_bits=g_init_bits;maxcode=MAXCODE(n_bits);ClearCode=1<<init_bits-1;EOFCode=ClearCode+1;free_ent=ClearCode+2;a_count=0;ent=nextPixel();hshift=0;for(fcode=HSIZE;fcode<65536;fcode*=2)++hshift;hshift=8-hshift;hsize_reg=HSIZE;cl_hash(hsize_reg);output(ClearCode,outs);outer_loop:while((c=nextPixel())!=EOF){fcode=(c<<BITS)+ent;i=c<<hshift^ent;if(htab[i]===fcode){ent=codetab[i];continue}else if(htab[i]>=0){disp=hsize_reg-i;if(i===0)disp=1;do{if((i-=disp)<0)i+=hsize_reg;if(htab[i]===fcode){ent=codetab[i];continue outer_loop}}while(htab[i]>=0)}output(ent,outs);ent=c;if(free_ent<1<<BITS){codetab[i]=free_ent++;htab[i]=fcode}else{cl_block(outs)}}output(ent,outs);output(EOFCode,outs)}function encode(outs){outs.writeByte(initCodeSize);remaining=width*height;curPixel=0;compress(initCodeSize+1,outs);outs.writeByte(0)}function flush_char(outs){if(a_count>0){outs.writeByte(a_count);outs.writeBytes(accum,0,a_count);a_count=0}}function MAXCODE(n_bits){return(1<<n_bits)-1}function nextPixel(){if(remaining===0)return EOF;--remaining;var pix=pixels[curPixel++];return pix&255}function output(code,outs){cur_accum&=masks[cur_bits];if(cur_bits>0)cur_accum|=code<<cur_bits;else cur_accum=code;cur_bits+=n_bits;while(cur_bits>=8){char_out(cur_accum&255,outs);cur_accum>>=8;cur_bits-=8}if(free_ent>maxcode||clear_flg){if(clear_flg){maxcode=MAXCODE(n_bits=g_init_bits);clear_flg=false}else{++n_bits;if(n_bits==BITS)maxcode=1<<BITS;else maxcode=MAXCODE(n_bits)}}if(code==EOFCode){while(cur_bits>0){char_out(cur_accum&255,outs);cur_accum>>=8;cur_bits-=8}flush_char(outs)}}this.encode=encode}module.exports=LZWEncoder},{}],3:[function(require,module,exports){var ncycles=100;var netsize=256;var maxnetpos=netsize-1;var netbiasshift=4;var intbiasshift=16;var intbias=1<<intbiasshift;var gammashift=10;var gamma=1<<gammashift;var betashift=10;var beta=intbias>>betashift;var betagamma=intbias<<gammashift-betashift;var initrad=netsize>>3;var radiusbiasshift=6;var radiusbias=1<<radiusbiasshift;var initradius=initrad*radiusbias;var radiusdec=30;var alphabiasshift=10;var initalpha=1<<alphabiasshift;var alphadec;var radbiasshift=8;var radbias=1<<radbiasshift;var alpharadbshift=alphabiasshift+radbiasshift;var alpharadbias=1<<alpharadbshift;var prime1=499;var prime2=491;var prime3=487;var prime4=503;var minpicturebytes=3*prime4;function NeuQuant(pixels,samplefac){var network;var netindex;var bias;var freq;var radpower;function init(){network=[];netindex=new Int32Array(256);bias=new Int32Array(netsize);freq=new Int32Array(netsize);radpower=new Int32Array(netsize>>3);var i,v;for(i=0;i<netsize;i++){v=(i<<netbiasshift+8)/netsize;network[i]=new Float64Array([v,v,v,0]);freq[i]=intbias/netsize;bias[i]=0}}function unbiasnet(){for(var i=0;i<netsize;i++){network[i][0]>>=netbiasshift;network[i][1]>>=netbiasshift;network[i][2]>>=netbiasshift;network[i][3]=i}}function altersingle(alpha,i,b,g,r){network[i][0]-=alpha*(network[i][0]-b)/initalpha;network[i][1]-=alpha*(network[i][1]-g)/initalpha;network[i][2]-=alpha*(network[i][2]-r)/initalpha}function alterneigh(radius,i,b,g,r){var lo=Math.abs(i-radius);var hi=Math.min(i+radius,netsize);var j=i+1;var k=i-1;var m=1;var p,a;while(j<hi||k>lo){a=radpower[m++];if(j<hi){p=network[j++];p[0]-=a*(p[0]-b)/alpharadbias;p[1]-=a*(p[1]-g)/alpharadbias;p[2]-=a*(p[2]-r)/alpharadbias}if(k>lo){p=network[k--];p[0]-=a*(p[0]-b)/alpharadbias;p[1]-=a*(p[1]-g)/alpharadbias;p[2]-=a*(p[2]-r)/alpharadbias}}}function contest(b,g,r){var bestd=~(1<<31);var bestbiasd=bestd;var bestpos=-1;var bestbiaspos=bestpos;var i,n,dist,biasdist,betafreq;for(i=0;i<netsize;i++){n=network[i];dist=Math.abs(n[0]-b)+Math.abs(n[1]-g)+Math.abs(n[2]-r);if(dist<bestd){bestd=dist;bestpos=i}biasdist=dist-(bias[i]>>intbiasshift-netbiasshift);if(biasdist<bestbiasd){bestbiasd=biasdist;bestbiaspos=i}betafreq=freq[i]>>betashift;freq[i]-=betafreq;bias[i]+=betafreq<<gammashift}freq[bestpos]+=beta;bias[bestpos]-=betagamma;return bestbiaspos}function inxbuild(){var i,j,p,q,smallpos,smallval,previouscol=0,startpos=0;for(i=0;i<netsize;i++){p=network[i];smallpos=i;smallval=p[1];for(j=i+1;j<netsize;j++){q=network[j];if(q[1]<smallval){smallpos=j;smallval=q[1]}}q=network[smallpos];if(i!=smallpos){j=q[0];q[0]=p[0];p[0]=j;j=q[1];q[1]=p[1];p[1]=j;j=q[2];q[2]=p[2];p[2]=j;j=q[3];q[3]=p[3];p[3]=j}if(smallval!=previouscol){netindex[previouscol]=startpos+i>>1;for(j=previouscol+1;j<smallval;j++)netindex[j]=i;previouscol=smallval;startpos=i}}netindex[previouscol]=startpos+maxnetpos>>1;for(j=previouscol+1;j<256;j++)netindex[j]=maxnetpos}function inxsearch(b,g,r){var a,p,dist;var bestd=1e3;var best=-1;var i=netindex[g];var j=i-1;while(i<netsize||j>=0){if(i<netsize){p=network[i];dist=p[1]-g;if(dist>=bestd)i=netsize;else{i++;if(dist<0)dist=-dist;a=p[0]-b;if(a<0)a=-a;dist+=a;if(dist<bestd){a=p[2]-r;if(a<0)a=-a;dist+=a;if(dist<bestd){bestd=dist;best=p[3]}}}}if(j>=0){p=network[j];dist=g-p[1];if(dist>=bestd)j=-1;else{j--;if(dist<0)dist=-dist;a=p[0]-b;if(a<0)a=-a;dist+=a;if(dist<bestd){a=p[2]-r;if(a<0)a=-a;dist+=a;if(dist<bestd){bestd=dist;best=p[3]}}}}}return best}function learn(){var i;var lengthcount=pixels.length;var alphadec=30+(samplefac-1)/3;var samplepixels=lengthcount/(3*samplefac);var delta=~~(samplepixels/ncycles);var alpha=initalpha;var radius=initradius;var rad=radius>>radiusbiasshift;if(rad<=1)rad=0;for(i=0;i<rad;i++)radpower[i]=alpha*((rad*rad-i*i)*radbias/(rad*rad));var step;if(lengthcount<minpicturebytes){samplefac=1;step=3}else if(lengthcount%prime1!==0){step=3*prime1}else if(lengthcount%prime2!==0){step=3*prime2}else if(lengthcount%prime3!==0){step=3*prime3}else{step=3*prime4}var b,g,r,j;var pix=0;i=0;while(i<samplepixels){b=(pixels[pix]&255)<<netbiasshift;g=(pixels[pix+1]&255)<<netbiasshift;r=(pixels[pix+2]&255)<<netbiasshift;j=contest(b,g,r);altersingle(alpha,j,b,g,r);if(rad!==0)alterneigh(rad,j,b,g,r);pix+=step;if(pix>=lengthcount)pix-=lengthcount;i++;if(delta===0)delta=1;if(i%delta===0){alpha-=alpha/alphadec;radius-=radius/radiusdec;rad=radius>>radiusbiasshift;if(rad<=1)rad=0;for(j=0;j<rad;j++)radpower[j]=alpha*((rad*rad-j*j)*radbias/(rad*rad))}}}function buildColormap(){init();learn();unbiasnet();inxbuild()}this.buildColormap=buildColormap;function getColormap(){var map=[];var index=[];for(var i=0;i<netsize;i++)index[network[i][3]]=i;var k=0;for(var l=0;l<netsize;l++){var j=index[l];map[k++]=network[j][0];map[k++]=network[j][1];map[k++]=network[j][2]}return map}this.getColormap=getColormap;this.lookupRGB=inxsearch}module.exports=NeuQuant},{}],4:[function(require,module,exports){var GIFEncoder,renderFrame;GIFEncoder=require("./GIFEncoder.js");renderFrame=function(frame){var encoder,page,stream,transfer;encoder=new GIFEncoder(frame.width,frame.height);if(frame.index===0){encoder.writeHeader()}else{encoder.firstFrame=false}encoder.setTransparent(frame.transparent);encoder.setRepeat(frame.repeat);encoder.setDelay(frame.delay);encoder.setQuality(frame.quality);encoder.setDither(frame.dither);encoder.setGlobalPalette(frame.globalPalette);encoder.addFrame(frame.data);if(frame.last){encoder.finish()}if(frame.globalPalette===true){frame.globalPalette=encoder.getGlobalPalette()}stream=encoder.stream();frame.data=stream.pages;frame.cursor=stream.cursor;frame.pageSize=stream.constructor.pageSize;if(frame.canTransfer){transfer=function(){var i,len,ref,results;ref=frame.data;results=[];for(i=0,len=ref.length;i<len;i++){page=ref[i];results.push(page.buffer)}return results}();return self.postMessage(frame,transfer)}else{return self.postMessage(frame)}};self.onmessage=function(event){return renderFrame(event.data)}},{"./GIFEncoder.js":1}]},{},[4]);`;

// ===== Palettes =====
const PALETTES = {
    original: null,
    gameboy: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]],
    nes: [[0, 0, 0], [252, 252, 252], [188, 188, 188], [124, 124, 124], [168, 16, 0], [248, 56, 0], [252, 160, 68], [252, 228, 160], [0, 112, 0], [0, 168, 0], [0, 228, 0], [128, 208, 16], [0, 0, 136], [0, 88, 248], [88, 216, 252], [152, 120, 248]],
    pico8: [[0, 0, 0], [29, 43, 83], [126, 37, 83], [0, 135, 81], [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232], [255, 0, 77], [255, 163, 0], [255, 236, 39], [0, 228, 54], [41, 173, 255], [131, 118, 156], [255, 119, 168], [255, 204, 170]],
    grayscale: [[0, 0, 0], [32, 32, 32], [64, 64, 64], [96, 96, 96], [128, 128, 128], [160, 160, 160], [192, 192, 192], [224, 224, 224], [255, 255, 255]]
};

// ===== State =====
const state = {
    sourceType: null,
    sourceFiles: [],
    currentFileIndex: -1,
    videoDuration: 0,
    blockSize: CONFIG.defaultBlockSize,
    extractionFps: CONFIG.defaultFps,
    currentPalette: 'original',
    bgRemovalEnabled: false,
    bgRemovalMode: 'auto', // 'auto' (AI) or 'manual' (color picking)
    bgColors: [],
    bgColorsHistory: [],
    bgTolerance: CONFIG.defaultTolerance,
    aiTolerance: 485,
    useAI: false, // AI background removal toggle
    bgMaskMode: 'remove',
    frames: [],
    isAnimating: false,
    animationFps: 8,
    animationFrame: 0,
    spriteFormat: 'grid',
    isProcessing: false,
    previewZoom: 1.0,
    isBgRemovalCanceled: false, // Flag for cancellation
    trimStart: 0,
    trimEnd: 0, // 0 means full duration
    userManuallyTrimmed: false // Track if user explicitly changed trim
};

// ===== Elements =====
const el = {};
function renderPreviewFrame(index) {
    if (index < 0 || index >= state.frames.length) return;
    state.animationFrame = index;

    const frame = state.frames[index];
    const canvas = el.spritePreviewCanvas;
    const ctx = canvas.getContext('2d');

    // Canvas size is set by CSS width/height for zoom, but internal resolution matches frame
    if (canvas.width !== frame.canvas.width || canvas.height !== frame.canvas.height) {
        canvas.width = frame.canvas.width;
        canvas.height = frame.canvas.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame.canvas, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame.canvas, 0, 0);

    // Zoom removed
}

// updatePreviewZoom removed

function initElements() {
    el.dropZone = document.getElementById('dropZone');
    el.fileInput = document.getElementById('fileInput');
    el.fileListContainer = document.getElementById('fileListContainer');
    el.fileList = document.getElementById('fileList');
    el.addMoreBtn = document.getElementById('addMoreBtn');
    el.previewWrapper = document.getElementById('previewWrapper');
    el.previewCanvas = document.getElementById('previewCanvas');
    el.sourceVideo = document.getElementById('sourceVideo');
    el.sourceImage = document.getElementById('sourceImage');

    el.controlsBar = document.getElementById('controlsBar');
    el.scrubberContainer = document.getElementById('scrubberContainer');
    el.videoScrubber = document.getElementById('videoScrubber');
    el.timeDisplay = document.getElementById('timeDisplay');
    el.trimHighlight = document.getElementById('trimHighlight');
    el.setInPointBtn = document.getElementById('setInPointBtn');
    el.setOutPointBtn = document.getElementById('setOutPointBtn');
    el.resetTrimBtn = document.getElementById('resetTrimBtn');
    el.applyAiToSelectedBtn = document.getElementById('applyAiToSelectedBtn');
    el.upscaleSelectedBtn = document.getElementById('upscaleSelectedBtn'); // New Upscale Button
    el.upscale768Btn = document.getElementById('upscale768Btn'); // New 768px Button
    el.trimHandleStart = document.getElementById('trimHandleStart'); // New
    el.trimHandleEnd = document.getElementById('trimHandleEnd'); // New
    el.scrubberWrapper = document.getElementById('scrubberWrapper'); // New

    el.blockSize = document.getElementById('blockSize');
    el.blockSizeValue = document.getElementById('blockSizeValue');
    el.extractionFps = document.getElementById('extractionFps');
    el.fpsValue = document.getElementById('fpsValue');
    el.fpsValue = document.getElementById('fpsValue');

    // New AI Controls
    el.useAiToggle = document.getElementById('useAiToggle');
    el.aiTolerance = document.getElementById('aiTolerance');
    el.aiToleranceValue = document.getElementById('aiToleranceValue');
    el.aiToleranceGroup = document.getElementById('aiToleranceGroup');
    el.stopProgressBtn = document.getElementById('stopProgressBtn');

    // Old buttons removed
    // el.removeBgBtn = document.getElementById('removeBgBtn');
    // el.bgStatusBar = document.getElementById('bgStatusBar');
    // el.bgProgressFill = document.getElementById('bgProgressFill');

    // BG Editor Modal Elements (for manual mode - kept for compatibility)
    el.bgEditorModal = document.getElementById('bgEditorModal');
    el.bgEditorClose = document.getElementById('bgEditorClose');
    el.bgEditorCancelBtn = document.getElementById('bgEditorCancelBtn');
    el.bgEditorApplyBtn = document.getElementById('bgEditorApplyBtn');
    el.bgEditorCanvas = document.getElementById('bgEditorCanvas');
    el.bgEditorTolerance = document.getElementById('bgEditorTolerance');
    el.bgEditorToleranceValue = document.getElementById('bgEditorToleranceValue');
    el.modeRemoveBtn = document.getElementById('modeRemoveBtn');
    el.modeKeepBtn = document.getElementById('modeKeepBtn');
    el.bgEditorUndoBtn = document.getElementById('bgEditorUndoBtn');
    el.bgEditorClearBtn = document.getElementById('bgEditorClearBtn');
    el.bgEditorColorsList = document.getElementById('bgEditorColorsList');

    el.captureOneBtn = document.getElementById('captureOneBtn');
    el.captureAllBtn = document.getElementById('captureAllBtn');
    el.clearBtn = document.getElementById('clearBtn');

    el.progressContainer = document.getElementById('progressContainer');
    el.progressFill = document.getElementById('progressFill');
    el.progressText = document.getElementById('progressText');

    // AI Controls
    el.aiTolerance = document.getElementById('aiTolerance');
    el.aiToleranceValue = document.getElementById('aiToleranceValue');

    // Timeline Previews
    el.timelinePreviews = document.getElementById('timelinePreviews');
    el.previewStartFrame = document.getElementById('previewStartFrame');
    el.previewEndFrame = document.getElementById('previewEndFrame');

    el.frameStrip = document.getElementById('frameStrip');
    el.stripFrames = document.getElementById('stripFrames');
    el.selectedCount = document.getElementById('selectedCount');
    el.totalCount = document.getElementById('totalCount');
    el.selectAllBtn = document.getElementById('selectAllBtn');
    el.deselectAllBtn = document.getElementById('deselectAllBtn');
    el.stripProgressFill = document.getElementById('stripProgressFill');

    el.animationControls = document.getElementById('animationControls');
    el.playPauseBtn = document.getElementById('playPauseBtn');
    el.animationSpeed = document.getElementById('animationSpeed');
    el.animationSpeedValue = document.getElementById('animationSpeedValue');

    el.exportSection = document.getElementById('exportSection');
    el.spriteFormat = document.getElementById('spriteFormat');
    el.exportGifBtn = document.getElementById('exportGifBtn');
    el.exportSpriteBtn = document.getElementById('exportSpriteBtn');
    el.exportVideoBtn = document.getElementById('exportVideoBtn');

    el.appTitle = document.getElementById('appTitle');
    el.modal = document.getElementById('spritePreviewModal');
    el.modalTitle = document.getElementById('modalTitle');
    el.modalClose = document.getElementById('modalClose');
    el.spritePreviewCanvas = document.getElementById('spritePreviewCanvas');
    // Speed & Zoom
    el.previewSpeedValue = document.getElementById('previewSpeedValue');
    el.speedDownBtn = document.getElementById('speedDownBtn');
    el.speedUpBtn = document.getElementById('speedUpBtn');

    // Zoom removed

    // Playback
    el.prevFrameBtn = document.getElementById('prevFrameBtn');
    el.previewPlayPauseBtn = document.getElementById('previewPlayPauseBtn');
    el.nextFrameBtn = document.getElementById('nextFrameBtn');

    el.previewStrip = document.getElementById('previewStrip');
    el.downloadSpriteBtn = document.getElementById('downloadSpriteBtn');

    el.pixelitImg = document.getElementById('pixelitImg');
    el.pixelitCanvas = document.getElementById('pixelitCanvas');
}

// ===== Event Listeners =====
// Safe event listener helper
function on(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
    } else {
        // Optional: console.warn(`Element not found for event: ${event}`);
    }
}

// ===== Event Listeners =====
function initEvents() {
    // Title reset
    on(el.appTitle, 'click', () => {
        if (confirm('¿Reiniciar la aplicación? Se perderá el trabajo actual.')) {
            location.reload();
        }
    });

    // Drop zone
    on(el.dropZone, 'click', () => el.fileInput.click());
    on(el.dropZone, 'dragover', e => { e.preventDefault(); el.dropZone.classList.add('dragover'); });
    on(el.dropZone, 'dragleave', () => el.dropZone.classList.remove('dragover'));
    on(el.dropZone, 'drop', e => { e.preventDefault(); el.dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    on(el.fileInput, 'change', e => handleFiles(e.target.files));
    on(el.addMoreBtn, 'click', () => el.fileInput.click());

    // Video
    on(el.sourceVideo, 'loadedmetadata', onVideoLoaded);
    on(el.sourceVideo, 'seeked', onVideoSeeked);
    on(el.videoScrubber, 'input', onScrub);

    // Image
    on(el.sourceImage, 'load', onImageLoaded);

    // Trim Controls
    on(el.setInPointBtn, 'click', setTrimStart);
    on(el.setOutPointBtn, 'click', setTrimEnd);
    on(el.resetTrimBtn, 'click', resetTrim);

    // Trim Handles Dragging
    setupDraggableHandle(el.trimHandleStart, 'start');
    setupDraggableHandle(el.trimHandleEnd, 'end');

    // Controls
    on(el.blockSize, 'input', () => { state.blockSize = +el.blockSize.value; el.blockSizeValue.textContent = state.blockSize; updatePreview(); });
    on(el.extractionFps, 'input', () => { state.extractionFps = +el.extractionFps.value; el.fpsValue.textContent = state.extractionFps; });

    // AI Toggle
    on(el.useAiToggle, 'change', () => {
        state.useAI = el.useAiToggle.checked;
        if (el.aiToleranceGroup) {
            el.aiToleranceGroup.style.display = state.useAI ? 'flex' : 'none';
            el.aiToleranceGroup.style.opacity = state.useAI ? '1' : '0';
        }
        updateCounts(); // Check if we should show Apply button
    });

    on(el.applyAiToSelectedBtn, 'click', reprocessSelectedFrames);
    on(el.upscaleSelectedBtn, 'click', () => upscaleSelectedFrames(1152));
    on(el.upscale768Btn, 'click', () => upscaleSelectedFrames(768));

    // Trim Handles Dragging
    setupDraggableHandle(el.trimHandleStart, 'start');
    setupDraggableHandle(el.trimHandleEnd, 'end');

    on(el.aiTolerance, 'input', () => {
        state.aiTolerance = +el.aiTolerance.value;
        if (el.aiToleranceValue) el.aiToleranceValue.textContent = state.aiTolerance;
    });

    if (el.stopProgressBtn) {
        on(el.stopProgressBtn, 'click', () => {
            state.isBgRemovalCanceled = true;
            el.stopProgressBtn.textContent = '🛑 Deteniendo...';
        });
    }

    // BG Editor Events
    on(el.bgEditorClose, 'click', closeBgEditor);
    on(el.bgEditorCancelBtn, 'click', closeBgEditor);
    on(el.bgEditorApplyBtn, 'click', applyBgEditor);

    on(el.bgEditorCanvas, 'mousedown', handleBgEditorMouseDown);
    if (window) window.addEventListener('mouseup', handleBgEditorMouseUp); // Window is safe
    on(el.bgEditorCanvas, 'mousemove', handleBgEditorMouseMove);

    on(el.bgEditorTolerance, 'input', () => {
        editorState.tolerance = +el.bgEditorTolerance.value;
        el.bgEditorToleranceValue.textContent = editorState.tolerance;
        updateBgEditorPreview();
    });

    on(el.modeRemoveBtn, 'click', () => setEditorMode('remove'));
    on(el.modeKeepBtn, 'click', () => setEditorMode('keep'));

    on(el.bgEditorUndoBtn, 'click', undoBgEditor);
    on(el.bgEditorClearBtn, 'click', clearBgEditor);

    // Frame strip
    on(el.captureOneBtn, 'click', captureOne);
    on(el.captureAllBtn, 'click', captureAll);
    on(el.clearBtn, 'click', clearCaptures);
    on(el.selectAllBtn, 'click', () => { state.frames.forEach(f => f.selected = true); updateFrameStrip(); });
    on(el.deselectAllBtn, 'click', () => { state.frames.forEach(f => f.selected = false); updateFrameStrip(); });

    // Animation
    on(el.playPauseBtn, 'click', toggleAnimation);
    on(el.animationSpeed, 'input', () => { state.animationFps = +el.animationSpeed.value; el.animationSpeedValue.textContent = state.animationFps + ' FPS'; });

    // Export
    on(el.spriteFormat, 'change', () => state.spriteFormat = el.spriteFormat.value);
    on(el.exportGifBtn, 'click', exportGif);
    on(el.exportSpriteBtn, 'click', exportSprite);
    on(el.exportVideoBtn, 'click', exportVideo);

    // Modal
    on(el.modalClose, 'click', closeModal);

    // Speed
    on(el.speedDownBtn, 'click', () => { console.log('➖ Speed Down clicked'); adjustPreviewSpeed(-1); });
    on(el.speedUpBtn, 'click', () => { console.log('➕ Speed Up clicked'); adjustPreviewSpeed(1); });

    // Playback
    on(el.prevFrameBtn, 'click', () => stepPreviewFrame(-1));
    on(el.nextFrameBtn, 'click', () => stepPreviewFrame(1));
    on(el.previewPlayPauseBtn, 'click', togglePreviewAnimation);

    on(el.downloadSpriteBtn, 'click', downloadSpriteSheet);
}

// ===== File Handling =====
function handleFiles(files) {
    console.log('📂 handleFiles called with:', files);
    try {
        if (!files || files.length === 0) return;

        const newFiles = Array.from(files).filter(f => f.type.startsWith('video/') || f.type.startsWith('image/'));

        if (newFiles.length === 0) {
            alert('Por favor, selecciona archivos de video o imagen válidos.');
            return;
        }

        state.sourceFiles.push(...newFiles);
        renderFileList();

        if (state.currentFileIndex === -1 && state.sourceFiles.length > 0) {
            selectFile(0);
        }

        // UI Updates
        if (el.dropZone) el.dropZone.style.display = 'none';
        if (el.fileListContainer) el.fileListContainer.style.display = 'flex';
        if (el.previewWrapper) el.previewWrapper.style.display = 'flex';
        if (el.controlsBar) el.controlsBar.style.display = 'flex';

    } catch (e) {
        console.error('Error in handleFiles:', e);
        alert('Error al abrir archivos: ' + e.message);
    }
}

function renderFileList() {
    el.fileList.innerHTML = '';

    state.sourceFiles.forEach((file, i) => {
        const item = document.createElement('div');
        item.className = 'file-item' + (i === state.currentFileIndex ? ' active' : '');
        item.onclick = () => selectFile(i);

        const info = document.createElement('div');
        info.className = 'file-info';

        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = file.name;

        const type = document.createElement('span');
        type.className = 'file-type';
        type.textContent = file.type.startsWith('video/') ? 'Video' : 'Imagen';

        info.appendChild(name);
        info.appendChild(type);

        const actions = document.createElement('div');
        actions.className = 'file-actions';

        const upBtn = document.createElement('button');
        upBtn.className = 'btn-icon';
        upBtn.textContent = '⬆️';
        upBtn.onclick = (e) => { e.stopPropagation(); moveFile(i, -1); };
        if (i === 0) upBtn.disabled = true;

        const downBtn = document.createElement('button');
        downBtn.className = 'btn-icon';
        downBtn.textContent = '⬇️';
        downBtn.onclick = (e) => { e.stopPropagation(); moveFile(i, 1); };
        if (i === state.sourceFiles.length - 1) downBtn.disabled = true;

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-icon';
        delBtn.textContent = '🗑️';
        delBtn.onclick = (e) => { e.stopPropagation(); removeFile(i); };

        actions.appendChild(upBtn);
        actions.appendChild(downBtn);
        actions.appendChild(delBtn);

        item.appendChild(info);
        item.appendChild(actions);
        el.fileList.appendChild(item);
    });
}

function selectFile(index) {
    if (index < 0 || index >= state.sourceFiles.length) return;

    const isSameFile = (index === state.currentFileIndex);
    state.currentFileIndex = index;
    const file = state.sourceFiles[index];
    state.sourceType = file.type.startsWith('video/') ? 'video' : 'image';

    // Reset trim when switching files, but keep it if just refreshing same file
    if (!isSameFile) {
        state.trimStart = 0;
        state.trimEnd = 0;
        state.userManuallyTrimmed = false;
    }
    updateTrimVisuals();

    renderFileList(); // Update active class

    const url = URL.createObjectURL(file);
    if (state.sourceType === 'video') {
        el.sourceVideo.src = url;
        el.sourceVideo.load();
    } else {
        el.sourceImage.src = url;
    }
}

function removeFile(index) {
    state.sourceFiles.splice(index, 1);

    if (state.sourceFiles.length === 0) {
        resetApp();
        return;
    }

    if (index === state.currentFileIndex) {
        selectFile(Math.min(index, state.sourceFiles.length - 1));
    } else if (index < state.currentFileIndex) {
        state.currentFileIndex--;
    }

    renderFileList();
}

function moveFile(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.sourceFiles.length) return;

    const temp = state.sourceFiles[index];
    state.sourceFiles[index] = state.sourceFiles[newIndex];
    state.sourceFiles[newIndex] = temp;

    if (state.currentFileIndex === index) state.currentFileIndex = newIndex;
    else if (state.currentFileIndex === newIndex) state.currentFileIndex = index;

    renderFileList();
}

function onVideoLoaded() {
    state.videoDuration = el.sourceVideo.duration;

    // Explicitly default to full duration
    state.trimStart = 0;
    state.trimEnd = state.videoDuration;

    el.scrubberContainer.style.display = 'flex';
    el.sourceVideo.currentTime = 0;

    // Force reset manual trim flag on new video load
    state.userManuallyTrimmed = false;

    updateTimeDisplay();
    updateTrimVisuals();

    // Init thumbnails
    initTimelinePreviews();
}

async function initTimelinePreviews() {
    await captureTimelineThumbnail('start', 0);
    // Slight delay to ensure UI updates or seek fully settles if needed
    await new Promise(r => setTimeout(r, 50));
    await captureTimelineThumbnail('end', state.videoDuration);
}

async function captureTimelineThumbnail(type, time) {
    if (!el.sourceVideo) return;
    if (state.isProcessing) return; // Prevent hijacking video during extraction

    const source = el.sourceVideo;
    const canvas = type === 'start' ? el.previewStartFrame : el.previewEndFrame;
    const ctx = canvas.getContext('2d');

    // Calculate aspect ratio
    const videoRatio = source.videoWidth / source.videoHeight;
    const maxWidth = 160;
    const maxHeight = 120;

    let targetWidth = maxWidth;
    let targetHeight = targetWidth / videoRatio;

    if (targetHeight > maxHeight) {
        targetHeight = maxHeight;
        targetWidth = targetHeight * videoRatio;
    }

    // Update canvas size
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // For initial load, we are at 0.
    if (Math.abs(source.currentTime - time) < 0.1) {
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    } else {
        // Force seek (will flash main preview but it's okay for init)
        const originalTime = source.currentTime;
        source.currentTime = time;
        await new Promise(r => source.addEventListener('seeked', r, { once: true }));
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

        // Return only if we were not at target (restore)
        if (Math.abs(originalTime - time) > 0.1) {
            source.currentTime = originalTime;
            // We don't wait for seeked here to avoid UI lag, just let it happen
        }
    }
}

function onVideoSeeked() {
    drawFrame();
}

function onScrub() {
    const time = (el.videoScrubber.value / 100) * state.videoDuration;
    el.sourceVideo.currentTime = time;
    updateTimeDisplay();
}

function updateTimeDisplay() {
    const current = formatTime(el.sourceVideo.currentTime);
    const total = formatTime(state.videoDuration);
    el.timeDisplay.textContent = `${current} / ${total}`;
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function onImageLoaded() {
    el.scrubberContainer.style.display = 'none';
    drawFrame();
}

function drawFrame() {
    const canvas = el.previewCanvas;
    const ctx = canvas.getContext('2d');
    const source = state.sourceType === 'video' ? el.sourceVideo : el.sourceImage;

    canvas.width = source.videoWidth || source.naturalWidth;
    canvas.height = source.videoHeight || source.naturalHeight;
    ctx.drawImage(source, 0, 0);

    updatePreview();
}

function updatePreview() {
    // Skip preview updates during batch processing to avoid duplicate AI requests
    if (state.isProcessing) return;

    const canvas = el.previewCanvas;
    if (canvas.width === 0) return;

    const source = state.sourceType === 'video' ? el.sourceVideo : el.sourceImage;

    // Create temp canvas with original
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = source.videoWidth || source.naturalWidth;
    tempCanvas.height = source.videoHeight || source.naturalHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(source, 0, 0);

    // Process and show in preview
    processFrame(tempCanvas).then(result => {
        canvas.width = result.width;
        canvas.height = result.height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(result, 0, 0);
    });
}

// ===== Background Mode =====
function setBgMode(mode) {
    state.bgRemovalMode = mode;

    if (el.bgModeAutoBtn) el.bgModeAutoBtn.classList.toggle('active', mode === 'auto');
    if (el.bgModeManualBtn) el.bgModeManualBtn.classList.toggle('active', mode === 'manual');

    if (mode === 'manual') {
        openBgEditor();
    } else {
        updatePreview();
    }
}

// ===== Processing =====
async function processFrame(sourceCanvas) {
    let inputCanvas = sourceCanvas;

    // 1. AI Background Removal (if enabled)
    // Synchronize state with UI to be 100% sure
    if (el.useAiToggle) {
        state.useAI = el.useAiToggle.checked;
    }

    if (state.useAI) {

        try {
            // Resize to max 512px before sending to AI to save memory
            const maxSize = 512;
            let resizedCanvas = sourceCanvas;

            if (sourceCanvas.width > maxSize || sourceCanvas.height > maxSize) {
                const scale = Math.min(maxSize / sourceCanvas.width, maxSize / sourceCanvas.height);
                const newWidth = Math.round(sourceCanvas.width * scale);
                const newHeight = Math.round(sourceCanvas.height * scale);

                resizedCanvas = document.createElement('canvas');
                resizedCanvas.width = newWidth;
                resizedCanvas.height = newHeight;
                resizedCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0, newWidth, newHeight);
                console.log(`📐 Resized ${sourceCanvas.width}x${sourceCanvas.height} → ${newWidth}x${newHeight} for AI`);
            }

            // Create a blob from resized source
            const blob = await new Promise(resolve => resizedCanvas.toBlob(resolve, 'image/png'));
            const aiResultBlob = await apiRemoveBackground(blob, state.aiTolerance);

            // Convert result blob back to canvas/image for pixelit
            const aiImg = new Image();
            await new Promise((resolve, reject) => {
                aiImg.onload = resolve;
                aiImg.onerror = reject;
                aiImg.src = URL.createObjectURL(aiResultBlob);
            });

            // Scale result back to original size
            const tempC = document.createElement('canvas');
            tempC.width = sourceCanvas.width;
            tempC.height = sourceCanvas.height;
            tempC.getContext('2d').drawImage(aiImg, 0, 0, tempC.width, tempC.height);
            inputCanvas = tempC;

            URL.revokeObjectURL(aiImg.src);

        } catch (e) {
            console.error("AI processing failed, keeping original frame:", e);
        }
    }

    const dataUrl = inputCanvas.toDataURL();
    const img = new Image();

    return new Promise(async (resolve, reject) => {
        img.onload = async () => {
            try {
                // Block Size inversely controls pixelation:
                // Block Size 50 = No pixelation (original)
                // Block Size 25 = Medium pixelation 
                // Block Size 1 = Maximum pixelation (largest blocks)

                if (state.blockSize >= 50) {
                    // No pixelation - just copy input to output
                    el.pixelitCanvas.width = img.width;
                    el.pixelitCanvas.height = img.height;
                    el.pixelitCanvas.getContext('2d').drawImage(img, 0, 0);
                    resolve(el.pixelitCanvas);
                    return;
                }

                // Scale: blockSize 1 -> scale 1, blockSize 49 -> scale 49
                // Lower scale = bigger pixels = more pixelated
                const px = new pixelit({
                    from: img,
                    to: el.pixelitCanvas,
                    scale: Math.max(1, state.blockSize)
                });

                px.pixelate();

                if (state.currentPalette !== 'original' && PALETTES[state.currentPalette]) {
                    px.setPalette(PALETTES[state.currentPalette]);
                    px.convertPalette();
                }

                resolve(el.pixelitCanvas);
            } catch (err) { reject(err); }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
}

// Helper for Backend Call
async function apiRemoveBackground(imageBlob, threshold) {
    const formData = new FormData();
    formData.append('image', imageBlob);
    formData.append('threshold', threshold);
    // Model is default (BiRefNet) on backend

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch('/remove-bg', {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Backend Error: ${response.statusText}`);
        }

        return await response.blob();
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}


// ===== AI Background Removal =====

// AI helper functions are now integrated into processFrame

function removeBackground(canvas) {
    if (state.bgColors.length === 0 && state.bgMaskMode === 'remove') return;

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const tol = state.bgTolerance * 4.41;
    const isKeepMode = state.bgMaskMode === 'keep';

    if (state.bgColors.length === 0) {
        if (isKeepMode) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        } else {
            return;
        }
    }

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (data[i + 3] === 0) continue;

        let match = false;
        for (let j = 0; j < state.bgColors.length; j++) {
            const [bgR, bgG, bgB] = state.bgColors[j];
            const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
            if (dist <= tol) {
                match = true;
                break;
            }
        }

        if (isKeepMode) {
            if (!match) data[i + 3] = 0;
        } else {
            if (match) data[i + 3] = 0;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

// ===== Background Editor Logic =====
let editorState = {
    colors: [],
    history: [],
    tolerance: 30,
    mode: 'remove', // 'remove' | 'keep'
    isDragging: false,
    lastPickTime: 0
};

function openBgEditor() {
    editorState.colors = [...state.bgColors];
    editorState.history = [];
    editorState.tolerance = state.bgTolerance;
    editorState.mode = state.bgMaskMode || 'remove';

    el.bgEditorTolerance.value = editorState.tolerance;
    el.bgEditorToleranceValue.textContent = editorState.tolerance;
    setEditorMode(editorState.mode, false);
    updateEditorUndo();
    renderEditorColorsList();

    const source = state.sourceType === 'video' ? el.sourceVideo : el.sourceImage;
    const canvas = el.bgEditorCanvas;

    canvas.width = source.videoWidth || source.naturalWidth;
    canvas.height = source.videoHeight || source.naturalHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0);

    updateBgEditorPreview();
    el.bgEditorModal.classList.add('active');
}

function closeBgEditor() {
    el.bgEditorModal.classList.remove('active');
}

function applyBgEditor() {
    state.bgColors = [...editorState.colors];
    state.bgMaskMode = editorState.mode;
    state.bgTolerance = editorState.tolerance;

    updatePreview();
    closeBgEditor();
}

function setEditorMode(mode, updatePreview = true) {
    editorState.mode = mode;

    el.modeRemoveBtn.classList.toggle('active', mode === 'remove');
    el.modeKeepBtn.classList.toggle('active', mode === 'keep');

    if (updatePreview) updateBgEditorPreview();
}

function updateBgEditorPreview() {
    const source = state.sourceType === 'video' ? el.sourceVideo : el.sourceImage;
    const canvas = el.bgEditorCanvas;
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(source, 0, 0);

    if (editorState.colors.length === 0 && editorState.mode === 'remove') return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const tol = editorState.tolerance * 4.41;
    const isKeep = editorState.mode === 'keep';

    if (editorState.colors.length === 0 && isKeep) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        let match = false;
        for (const c of editorState.colors) {
            const dist = Math.sqrt((r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2);
            if (dist <= tol) { match = true; break; }
        }

        if (isKeep) {
            if (!match) data[i + 3] = 0;
        } else {
            if (match) data[i + 3] = 0;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

function handleBgEditorMouseDown(e) {
    editorState.isDragging = true;
    saveEditorHistory();
    pickEditorColor(e);
}

function handleBgEditorMouseUp() {
    editorState.isDragging = false;
}

function handleBgEditorMouseMove(e) {
    if (!editorState.isDragging) return;

    const now = Date.now();
    if (now - editorState.lastPickTime > 50) {
        pickEditorColor(e);
        editorState.lastPickTime = now;
    }
}

function pickEditorColor(e) {
    const canvas = el.bgEditorCanvas;
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;

    const source = state.sourceType === 'video' ? el.sourceVideo : el.sourceImage;

    const tempC = document.createElement('canvas');
    tempC.width = 1; tempC.height = 1;
    const tempCtx = tempC.getContext('2d');
    tempCtx.drawImage(source, x, y, 1, 1, 0, 0, 1, 1);
    const p = tempCtx.getImageData(0, 0, 1, 1).data;
    const color = [p[0], p[1], p[2]];

    addEditorColor(color);
}

function addEditorColor(color) {
    const tol = Math.max(10, editorState.tolerance * 4.41);

    for (const c of editorState.colors) {
        const dist = Math.sqrt((color[0] - c[0]) ** 2 + (color[1] - c[1]) ** 2 + (color[2] - c[2]) ** 2);
        if (dist < tol) return;
    }

    editorState.colors.push(color);
    renderEditorColorsList();
    updateBgEditorPreview();
}

function renderEditorColorsList() {
    const container = el.bgEditorColorsList;
    container.innerHTML = '';
    editorState.colors.forEach((c, i) => {
        const chip = document.createElement('div');
        chip.className = 'color-swatch-chip';
        chip.style.backgroundColor = `rgb(${c[0]},${c[1]},${c[2]})`;
        chip.onclick = () => removeEditorColor(i);
        container.appendChild(chip);
    });
}

function removeEditorColor(index) {
    saveEditorHistory();
    editorState.colors.splice(index, 1);
    renderEditorColorsList();
    updateBgEditorPreview();
}

function clearBgEditor() {
    saveEditorHistory();
    editorState.colors = [];
    renderEditorColorsList();
    updateBgEditorPreview();
}

function saveEditorHistory() {
    if (editorState.history.length > 20) editorState.history.shift();
    editorState.history.push([...editorState.colors]);
    updateEditorUndo();
}

function undoBgEditor() {
    if (editorState.history.length === 0) return;
    editorState.colors = editorState.history.pop();
    renderEditorColorsList();
    updateBgEditorPreview();
    updateEditorUndo();
}

function updateEditorUndo() {
    el.bgEditorUndoBtn.disabled = editorState.history.length === 0;
}


// ===== Capture =====
async function captureOne() {
    console.log("📸 Capture One Clicked");

    // Guard against concurrent captures
    if (state.isProcessing) {
        console.log("📸 Already processing, ignoring click");
        return;
    }

    if (!state.sourceType) {
        alert("Error: No hay medio cargado (SourceType is null).");
        return;
    }

    const source = state.sourceType === 'video' ? el.sourceVideo : el.sourceImage;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = source.videoWidth || source.naturalWidth;
    tempCanvas.height = source.videoHeight || source.naturalHeight;
    tempCanvas.getContext('2d').drawImage(source, 0, 0);

    // UI Feedback: Use Progress Bar
    console.log("📸 Calling captureOne... BlockSize:", state.blockSize);
    state.isProcessing = true;
    el.progressContainer.style.display = 'flex';
    el.progressText.textContent = 'Procesando Frame Actual...';
    el.progressFill.style.width = '50%'; // Start at 50%
    el.captureOneBtn.disabled = true;

    try {
        console.log("📸 Calling processFrame...");
        const processed = await processFrame(tempCanvas);
        console.log("📸 processFrame returned:", processed);

        el.progressFill.style.width = '100%';

        const result = document.createElement('canvas');
        result.width = processed.width;
        result.height = processed.height;
        result.getContext('2d').drawImage(processed, 0, 0);

        state.frames.push({
            canvas: result,
            original: tempCanvas, // Store original for AI reprocessing
            selected: true
        });
        showFrameStrip();

        // Brief delay to show 100% completion
        await new Promise(r => setTimeout(r, 200));

    } catch (error) {
        console.error("Capture One failed:", error);
        alert("Error capturando frame: " + error.message);
    } finally {
        el.captureOneBtn.disabled = false;
        el.progressContainer.style.display = 'none';
        state.isProcessing = false;
    }
}

async function captureAll() {
    console.log('🎬 captureAll clicked');

    if (state.sourceFiles.length === 0) {
        console.warn('⚠️ captureAll: No source files');
        alert('No hay archivos cargados para procesar.');
        return;
    }

    if (state.isProcessing) {
        console.warn('⚠️ captureAll: Already processing');
        alert('Ya se está procesando una tarea. Espera a que termine.');
        return;
    }

    state.isProcessing = true;
    state.isBgRemovalCanceled = false; // Reset cancellation flag
    el.progressContainer.style.display = 'flex';
    el.captureAllBtn.disabled = true;

    let totalExtractedAny = 0;

    // Capture current trim settings before loop, as loading videos will reset state
    const preservedTrimStart = state.trimStart;
    const preservedTrimEnd = state.trimEnd;
    const preservedCurrentIndex = state.currentFileIndex;

    try {
        console.log(`🚀 Starting capture of ${state.sourceFiles.length} files...`);
        for (let fIndex = 0; fIndex < state.sourceFiles.length; fIndex++) {
            if (state.isBgRemovalCanceled) break;

            const file = state.sourceFiles[fIndex];
            const isVideo = file.type.startsWith('video/');

            el.progressText.textContent = `Procesando ${fIndex + 1}/${state.sourceFiles.length}: ${file.name}`;
            el.progressFill.style.width = '0%';

            const url = URL.createObjectURL(file);

            if (isVideo) {
                el.sourceVideo.src = url;
                await new Promise(resolve => el.sourceVideo.addEventListener('loadedmetadata', resolve, { once: true }));

                const video = el.sourceVideo;

                // Determine range
                let startT = 0;
                let endT = video.duration;

                if (fIndex === preservedCurrentIndex) {
                    // Use preserved values for the current file
                    startT = preservedTrimStart;
                    // Ensure trimEnd is valid
                    endT = preservedTrimEnd > 0 ? preservedTrimEnd : video.duration;
                } else {
                    // Force full duration for other files
                    startT = 0;
                    endT = video.duration;
                }

                // Safety checks
                if (endT > video.duration) endT = video.duration;
                if (startT >= endT) startT = 0;

                video.currentTime = startT;

                const fps = state.extractionFps;
                const interval = 1 / fps;

                const durationToExtract = endT - startT;
                const maxPossibleFrames = Math.floor(durationToExtract * fps);
                const totalFrames = Math.min(maxPossibleFrames, CONFIG.maxFrames);

                for (let i = 0; i < totalFrames; i++) {
                    if (state.isBgRemovalCanceled) break;

                    const time = startT + (i * interval);
                    if (time > endT) break;

                    video.currentTime = time;
                    await new Promise(r => video.addEventListener('seeked', r, { once: true }));

                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = video.videoWidth;
                    tempCanvas.height = video.videoHeight;
                    tempCanvas.getContext('2d').drawImage(video, 0, 0);

                    // Show detailed progress
                    const aiLabel = state.useAI ? ' (AI)' : '';
                    const progressPrefix = totalFrames === CONFIG.maxFrames ? '(Max) ' : '';
                    el.progressText.textContent = `Frame ${i + 1}/${totalFrames} ${progressPrefix}${aiLabel}- ${file.name}`;

                    const processed = await processFrame(tempCanvas);
                    const result = document.createElement('canvas');
                    result.width = processed.width;
                    result.height = processed.height;
                    result.getContext('2d').drawImage(processed, 0, 0);

                    state.frames.push({
                        canvas: result,
                        original: tempCanvas, // Store original
                        selected: true
                    });
                    totalExtractedAny++;

                    const pct = ((i + 1) / totalFrames) * 100;
                    el.progressFill.style.width = pct + '%';
                }
            } else {
                const img = new Image();
                img.src = url;
                await new Promise(resolve => img.onload = resolve);

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.naturalWidth;
                tempCanvas.height = img.naturalHeight;
                tempCanvas.getContext('2d').drawImage(img, 0, 0);

                const processed = await processFrame(tempCanvas);
                const result = document.createElement('canvas');
                result.width = processed.width;
                result.height = processed.height;
                result.getContext('2d').drawImage(processed, 0, 0);

                state.frames.push({
                    canvas: result,
                    original: tempCanvas, // Store original
                    selected: true
                });
                totalExtractedAny++;
            }

            URL.revokeObjectURL(url);
        }

        if (totalExtractedAny === 0) {
            alert('No se extrajeron frames. Verifica la duración y los FPS.');
        } else {
            console.log(`✅ Extracted ${totalExtractedAny} frames total.`);
        }

    } catch (e) {
        console.error("Error in captureAll:", e);
        alert("Ocurrió un error al extraer frames: " + e.message);
    } finally {
        if (state.currentFileIndex >= 0) {
            selectFile(state.currentFileIndex);
        }

        el.progressContainer.style.display = 'none';
        state.isProcessing = false;
        el.captureAllBtn.disabled = false;
        showFrameStrip();
    }
}

function clearCaptures() {
    stopAnimation();
    state.frames = [];
    showFrameStrip(); // Takes care of hiding if empty
}

function resetApp() {
    state.frames = [];
    state.sourceFiles = [];
    state.currentFileIndex = -1;
    state.sourceType = null;
    el.sourceVideo.src = '';
    el.sourceImage.src = '';
    el.previewCanvas.width = 0;
    el.dropZone.style.display = 'flex';
    el.fileListContainer.style.display = 'none';
    el.fileList.innerHTML = '';
    el.previewWrapper.style.display = 'none';
    el.controlsBar.style.display = 'none';
    el.frameStrip.style.display = 'none';
    el.animationControls.style.display = 'none';
    el.exportSection.style.display = 'none';
    stopAnimation();
    el.fileInput.value = ''; // Reset file input so same file can be selected again
}

// ===== Frame Strip =====
function showFrameStrip() {
    if (state.frames.length === 0) {
        el.frameStrip.style.display = 'none';
        el.animationControls.style.display = 'none';
        el.exportSection.style.display = 'none';
        return;
    }

    el.frameStrip.style.display = 'block';
    el.animationControls.style.display = 'flex';
    el.exportSection.style.display = 'block';

    updateFrameStrip();
    startAnimation();
}

function updateFrameStrip() {
    el.stripFrames.innerHTML = '';

    state.frames.forEach((frame, i) => {
        const thumb = document.createElement('div');
        thumb.className = 'frame-thumb' + (frame.selected ? ' selected' : '');
        thumb.dataset.index = i;

        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(200 / frame.canvas.width, 200 / frame.canvas.height);
        const w = frame.canvas.width * scale;
        const h = frame.canvas.height * scale;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(frame.canvas, (200 - w) / 2, (200 - h) / 2, w, h);

        thumb.appendChild(canvas);

        const num = document.createElement('span');
        num.className = 'frame-num';
        num.textContent = i + 1;
        thumb.appendChild(num);

        thumb.addEventListener('click', () => {
            frame.selected = !frame.selected;
            thumb.classList.toggle('selected', frame.selected);
            updateCounts();
        });

        el.stripFrames.appendChild(thumb);
    });

    updateCounts();
}

function updateCounts() {
    const selected = state.frames.filter(f => f.selected).length;
    el.selectedCount.textContent = selected;
    el.totalCount.textContent = state.frames.length;

    const hasSelected = selected > 0;
    el.exportGifBtn.disabled = !hasSelected;
    el.exportSpriteBtn.disabled = !hasSelected;
    el.exportVideoBtn.disabled = !hasSelected;

    // Show "Apply AI" only if we have selected frames and AI is enabled
    // Only if we stored originals (which we do now for new frames)
    if (el.applyAiToSelectedBtn) {
        el.applyAiToSelectedBtn.style.display = (hasSelected && state.useAI) ? 'flex' : 'none';
    }

    // Show Upscale buttons if we have selected frames
    if (el.upscaleSelectedBtn) {
        el.upscaleSelectedBtn.style.display = hasSelected ? 'flex' : 'none';
    }
    if (el.upscale768Btn) {
        el.upscale768Btn.style.display = hasSelected ? 'flex' : 'none';
    }
}

async function reprocessSelectedFrames() {
    const selected = state.frames.filter(f => f.selected);
    if (selected.length === 0) return;

    // Check if they have originals
    const missingOriginals = selected.some(f => !f.original);
    if (missingOriginals) {
        if (!confirm('Algunos frames antiguos no tienen copia original guardada y no se pueden mejorar. ¿Continuar con los que sí tienen?')) {
            return;
        }
    }

    state.isProcessing = true;
    state.isBgRemovalCanceled = false;
    el.progressContainer.style.display = 'flex';
    el.applyAiToSelectedBtn.disabled = true;

    try {
        for (let i = 0; i < selected.length; i++) {
            if (state.isBgRemovalCanceled) break;

            const frame = selected[i];
            if (!frame.original) continue;

            el.progressText.textContent = `Procesando ${i + 1}/${selected.length} con IA...`;
            el.progressFill.style.width = ((i + 1) / selected.length * 100) + '%';

            // Process using the ORIGINAL data, respecting current AI settings
            const processed = await processFrame(frame.original);

            // Update the frame canvas
            frame.canvas.width = processed.width;
            frame.canvas.height = processed.height;
            frame.canvas.getContext('2d').clearRect(0, 0, frame.canvas.width, frame.canvas.height);
            frame.canvas.getContext('2d').drawImage(processed, 0, 0);
        }

        updateFrameStrip(); // Redraw thumbnails

    } catch (e) {
        console.error(e);
        alert('Error reprocesando: ' + e.message);
    } finally {
        state.isProcessing = false;
        el.progressContainer.style.display = 'none';
        el.progressContainer.style.display = 'none';
        el.applyAiToSelectedBtn.disabled = false;
    }
}

// ===== Upscale Logic =====
async function upscaleSelectedFrames(targetHeight = 1152) {
    const selected = state.frames.filter(f => f.selected);
    if (selected.length === 0) return;

    state.isProcessing = true;
    state.isBgRemovalCanceled = false;
    el.progressContainer.style.display = 'flex';

    // Disable both buttons
    if (el.upscaleSelectedBtn) el.upscaleSelectedBtn.disabled = true;
    if (el.upscale768Btn) el.upscale768Btn.disabled = true;

    try {
        for (let i = 0; i < selected.length; i++) {
            if (state.isBgRemovalCanceled) break;

            const frame = selected[i];

            // Use current canvas as source (so we can upscale already processed/pixelated/bg-removed images)
            // Or should we use original? 
            // Usually upscaler is applied at the END to get high res output,
            // OR at the beginning to get better details before pixelation?
            // "Real-ESRGAN" suggests high quality output. 
            // If we upscale the pixel art, it might look blurrier or weird if not pixel-art optimized.
            // But Real-ESRGAN x4plus is for photos/anime.
            // If the user wants to upscale the *video frame* to get better detail *before* pixelation, we should use original.
            // If they want to upscale the *result*, we use canvas.
            // Given "Video to Pixel Art", maybe they want to make the pixel art bigger?
            // "Video to Pixel Art" usually implies low res.
            // BeRefNet is for BG removal.
            // Upscaler is likely to improve input quality OR to output high-res assets.
            // Let's assume we upscale the CURRENT state of the frame (what looks like pixel art or the cropped frame).

            // However, Real-ESRGAN on pixel art might ruin the hard edges.
            // But if it's "pixel art materials" context...
            // Let's try upscaling the *source image* (original) if available, 
            // OR the current canvas if we want to upscale the result.

            // Actually, if we upscale the pixelated image, it will look like smooth blobs.
            // IF we upscale the original, we get a huge image, which then PixelIt will downscale again if BlockSize is set.
            // UNLESS block size is large (low pixelation).

            // Let's treat this as "Upscale the current visual result".

            // Start with forceful AI for 2k, but conditional for 768px
            let useAi = true;
            if (targetHeight === 768) {
                // Only use AI if the source is smaller than target
                if (frame.canvas.height < targetHeight) {
                    useAi = true;
                } else {
                    useAi = false;
                }
            }

            const modeText = useAi ? "Upscaling (AI)" : "Resizing";
            el.progressText.textContent = `${modeText} → Height ${targetHeight} (${i + 1}/${selected.length})...`;
            el.progressFill.style.width = ((i + 1) / selected.length * 100) + '%';

            // Convert canvas to blob
            const blob = await new Promise(resolve => frame.canvas.toBlob(resolve, 'image/png'));

            const upscaledBlob = await apiUpscaleImage(blob, targetHeight, useAi);

            // Load result
            const upscaledImg = await createImageBitmap(upscaledBlob);

            // Update frame canvas size and draw
            frame.canvas.width = upscaledImg.width;
            frame.canvas.height = upscaledImg.height;
            frame.canvas.getContext('2d').drawImage(upscaledImg, 0, 0);

            // Note: We are replacing the canvas content with the upscaled version.
            // If they modify block size later, `processFrame` might run again.
            // `processFrame` uses `frame.original` if we re-trigger it from UI?
            // Wait, `processFrame` takes `sourceCanvas` argument.
            // The pipeline is: Source -> [Resize for AI] -> [AI BG Removal] -> [PixelIt] -> Result.
            // If we upscale the Result, we are just changing the Frame Canvas.
            // If they touch BlockSize, it might regenerate from Original (low res) and overwrite Upscale.
            // This is acceptable behavior for a "post-processing" tool button.
            // To make it persistent, we would need to update `frame.original`, but that would make EVERYTHING huge.
            // Let's just update the canvas for now.
        }

        updateFrameStrip();

    } catch (e) {
        console.error(e);
        alert('Error upscaling: ' + e.message);
    } finally {
        state.isProcessing = false;
        el.progressContainer.style.display = 'none';
        if (el.upscaleSelectedBtn) el.upscaleSelectedBtn.disabled = false;
        if (el.upscale768Btn) el.upscale768Btn.disabled = false;
    }
}

async function apiUpscaleImage(imageBlob, targetHeight = 1152, useAi = true) {
    const formData = new FormData();
    formData.append('image', imageBlob);
    formData.append('target_height', targetHeight);
    formData.append('use_ai', useAi);

    const controller = new AbortController();
    // Long timeout for Upscaling
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s

    try {
        const response = await fetch('/upscale', {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Upscale Error: ${response.statusText}`);
        }

        return await response.blob();
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}


// ===== Animation =====
function startAnimation() {
    if (state.isAnimating) return;
    state.isAnimating = true;
    state.animationFrame = 0;
    el.playPauseBtn.textContent = '⏸️';
    animate();
}

function stopAnimation() {
    state.isAnimating = false;
    el.playPauseBtn.textContent = '▶️';
}

function toggleAnimation() {
    state.isAnimating ? stopAnimation() : startAnimation();
}

function animate() {
    if (!state.isAnimating) return;

    const selected = state.frames.filter(f => f.selected);
    if (selected.length === 0) return;

    const idx = state.animationFrame % selected.length;
    const frame = selected[idx];

    const canvas = el.previewCanvas;
    canvas.width = frame.canvas.width;
    canvas.height = frame.canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame.canvas, 0, 0);

    // Highlight in strip
    el.stripFrames.querySelectorAll('.frame-thumb').forEach((t, i) => {
        t.classList.toggle('active', state.frames[i] === frame);
    });

    // Progress
    el.stripProgressFill.style.width = ((idx + 1) / selected.length * 100) + '%';

    state.animationFrame++;
    setTimeout(() => state.isAnimating && animate(), 1000 / state.animationFps);
}

// ===== Export =====
async function exportGif() {
    const selected = state.frames.filter(f => f.selected);
    if (selected.length === 0) return;

    el.progressContainer.style.display = 'flex';
    el.progressText.textContent = 'Generando GIF...';
    el.progressFill.style.width = '100%';

    try {
        const first = selected[0].canvas;

        // Create worker blob URL
        const workerBlob = new Blob([GIF_WORKER_SCRIPT], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);

        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: Math.floor(first.width),
            height: Math.floor(first.height),
            workerScript: workerUrl
        });

        // Use animationFps (speed selected by user) for delay calculation
        // delay is in ms. 1000 / fps
        const delay = 1000 / state.animationFps;

        selected.forEach(f => gif.addFrame(f.canvas, { delay: delay, copy: true }));

        gif.on('finished', blob => {
            const url = URL.createObjectURL(blob);
            download(url, 'gif');
            el.progressContainer.style.display = 'none';
            // Cleanup worker URL
            URL.revokeObjectURL(workerUrl);
        });

        gif.render();
    } catch (e) {
        console.error(e);
        alert('Error generando GIF: ' + e.message);
        el.progressContainer.style.display = 'none';
    }
}

async function exportSprite() {
    const selected = state.frames.filter(f => f.selected);
    if (selected.length === 0) return;

    openSpritePreview(selected);
}

// ===== Sprite Preview Modal =====
let previewState = {
    frames: [],
    currentFrame: 0,
    fps: 12,
    isPlaying: true,
    timer: null
};

function openSpritePreview(frames) {
    previewState.frames = frames;
    previewState.currentFrame = 0;
    previewState.fps = 12; // Reset to default
    previewState.isPlaying = true;

    previewState.isPlaying = true;

    updateSpeedDisplay();
    el.previewPlayPauseBtn.textContent = '⏸';

    el.modal.classList.add('active');

    renderPreviewStrip();
    startPreviewAnimation();
}

function renderPreviewStrip() {
    el.previewStrip.innerHTML = '';
    // Thumbnails disabled per request.
}

function findNextSelectedFrame(startIdx) {
    // Search forward
    for (let i = startIdx + 1; i < previewState.frames.length; i++) {
        if (previewState.frames[i].selected) return i;
    }
    // Search backward
    for (let i = startIdx - 1; i >= 0; i--) {
        if (previewState.frames[i].selected) return i;
    }
    return -1; // No frames selected
}

function startPreviewAnimation() {
    if (previewState.timer) clearInterval(previewState.timer);
    previewState.isPlaying = true;
    el.previewPlayPauseBtn.textContent = '⏸';

    previewState.timer = setInterval(() => {
        // Find next selected frame
        let nextIdx = (previewState.currentFrame + 1) % previewState.frames.length;
        let attempts = 0;
        while (!previewState.frames[nextIdx].selected && attempts < previewState.frames.length) {
            nextIdx = (nextIdx + 1) % previewState.frames.length;
            attempts++;
        }

        if (attempts < previewState.frames.length) { // If a selected frame was found
            previewState.currentFrame = nextIdx;
            drawPreviewFrame();
            updatePreviewStripActive(false); // No scroll during animation
        } else {
            // No selected frames, stop animation
            stopPreviewAnimation();
            el.spritePreviewCanvas.width = 0;
            el.spritePreviewCanvas.height = 0;
        }
    }, 1000 / previewState.fps);

    drawPreviewFrame();
}

function stopPreviewAnimation() {
    if (previewState.timer) clearInterval(previewState.timer);
    previewState.isPlaying = false;
    el.previewPlayPauseBtn.textContent = '▶️';
}

function togglePreviewAnimation() {
    previewState.isPlaying ? stopPreviewAnimation() : startPreviewAnimation();
}

function adjustPreviewSpeed(delta) {
    console.log('🔧 adjustPreviewSpeed called, delta:', delta, 'current fps:', previewState.fps);
    const newFps = Math.max(1, Math.min(60, previewState.fps + delta));
    console.log('🔧 newFps:', newFps);
    if (newFps !== previewState.fps) {
        previewState.fps = newFps;
        updateSpeedDisplay();
        if (previewState.isPlaying) startPreviewAnimation();
    }
}

function updateSpeedDisplay() {
    if (el.previewSpeedValue) {
        el.previewSpeedValue.textContent = `${previewState.fps} FPS`;
    }
}

function stepPreviewFrame(direction) {
    stopPreviewAnimation();

    // Find next/prev SELECTED frame
    let nextIdx = previewState.currentFrame + direction;

    // Wrap around logic respecting selection
    if (direction > 0) {
        // Searching forward
        if (nextIdx >= previewState.frames.length) nextIdx = 0;
        while (!previewState.frames[nextIdx].selected) {
            nextIdx++;
            if (nextIdx >= previewState.frames.length) nextIdx = 0;
            if (nextIdx === previewState.currentFrame) return; // Full loop, no other selected
        }
    } else {
        // Searching backward
        if (nextIdx < 0) nextIdx = previewState.frames.length - 1;
        while (!previewState.frames[nextIdx].selected) {
            nextIdx--;
            if (nextIdx < 0) nextIdx = previewState.frames.length - 1;
            if (nextIdx === previewState.currentFrame) return; // Full loop
        }
    }

    previewState.currentFrame = nextIdx;
    drawPreviewFrame();
    updatePreviewStripActive(true); // Scroll on manual step
}

function drawPreviewFrame() {
    const frame = previewState.frames[previewState.currentFrame];
    if (!frame || !frame.selected) {
        // Clear canvas if no valid frame or frame is not selected
        el.spritePreviewCanvas.width = 0;
        el.spritePreviewCanvas.height = 0;
        return;
    }

    const canvas = el.spritePreviewCanvas;
    const ctx = canvas.getContext('2d');

    // Resize canvas to fit frame first time or just clear
    canvas.width = frame.canvas.width;
    canvas.height = frame.canvas.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame.canvas, 0, 0);
}

function updatePreviewStripActive(shouldScroll = false) {
    const thumbs = el.previewStrip.children;
    for (let i = 0; i < thumbs.length; i++) {
        const frame = previewState.frames[i];
        const thumb = thumbs[i];

        // Active = Currently displayed in animation
        thumb.classList.toggle('active', i === previewState.currentFrame);

        // Selected = Checked for export
        thumb.classList.toggle('selected', frame.selected);

        if (shouldScroll && i === previewState.currentFrame) {
            thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
}

function downloadSpriteSheet() {
    const frames = previewState.frames.filter(f => f.selected);
    if (frames.length === 0) {
        alert("No frames selected for export!");
        return;
    }

    const first = frames[0].canvas;
    const count = frames.length;
    const w = first.width;
    const h = first.height;

    let cols = 1;
    let rows = 1;

    // Determine layout based on state.spriteFormat
    if (state.spriteFormat === 'horizontal') {
        cols = count;
        rows = 1;
    } else if (state.spriteFormat === 'vertical') {
        cols = 1;
        rows = count;
    } else {
        // Grid (default)
        cols = Math.ceil(Math.sqrt(count));
        rows = Math.ceil(count / cols);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w * cols;
    canvas.height = h * rows;
    const ctx = canvas.getContext('2d');

    frames.forEach((f, i) => {
        let c = 0;
        let r = 0;

        if (state.spriteFormat === 'horizontal') {
            c = i;
            r = 0;
        } else if (state.spriteFormat === 'vertical') {
            c = 0;
            r = i;
        } else {
            // Grid
            c = i % cols;
            r = Math.floor(i / cols);
        }

        ctx.drawImage(f.canvas, c * w, r * h);
    });

    const url = canvas.toDataURL('image/png');
    download(url, 'png');
}

function closeModal() {
    el.modal.classList.remove('active');
    stopPreviewAnimation();
}

async function exportVideo() {
    const selected = state.frames.filter(f => f.selected);
    if (selected.length === 0) return;

    if (typeof VideoEncoder === 'undefined') {
        alert('Tu navegador no soporta WebCodecs. Usa Chrome.');
        return;
    }

    el.progressContainer.style.display = 'flex';
    el.progressText.textContent = 'Generando MP4...';
    el.progressFill.style.width = '0%';

    try {
        const first = selected[0].canvas;
        // MP4 dimensions must be even
        const w = first.width % 2 === 0 ? first.width : first.width + 1;
        const h = first.height % 2 === 0 ? first.height : first.height + 1;
        const fps = state.animationFps; // Use current animation speed

        const muxer = new Mp4Muxer.Muxer({
            target: new Mp4Muxer.ArrayBufferTarget(),
            video: { codec: 'avc', width: w, height: h },
            fastStart: 'in-memory'
        });

        const encoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: e => console.error(e)
        });

        await encoder.configure({
            codec: 'avc1.42001f',
            width: w, height: h,
            bitrate: 2_000_000 // 2Mbps
        });

        const frameDuration = 1_000_000 / fps; // Microseconds

        for (let i = 0; i < selected.length; i++) {
            const frame = selected[i];
            const bitmap = await createImageBitmap(frame.canvas);

            // Timestamp in microseconds
            const timestamp = i * frameDuration;

            const videoFrame = new VideoFrame(bitmap, { timestamp: timestamp });
            encoder.encode(videoFrame, { keyFrame: i === 0 });
            videoFrame.close();

            el.progressText.textContent = `Codificando frame ${i + 1}/${selected.length}`;
            el.progressFill.style.width = ((i + 1) / selected.length * 100) + '%';
        }

        await encoder.flush();
        muxer.finalize();

        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);

        download(url, 'mp4');
        el.progressContainer.style.display = 'none';

    } catch (err) {
        console.error(err);
        alert('Error al generar MP4: ' + err.message);
        el.progressContainer.style.display = 'none';
    }
}

function download(url, ext) {
    const name = state.sourceFiles.length > 0 ? state.sourceFiles[0].name.replace(/\.[^.]+$/, '') : 'pixel_art';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}_pixelart.${ext}`;
    a.click();
}

// function showModal(title) { ... } // Removed old modal functions
// function closeModal() { ... } // Replaced above

// ===== Trim Logic =====
function setTrimStart() {
    if (!el.sourceVideo || !state.videoDuration) return;
    const current = el.sourceVideo.currentTime;

    // Validate
    let end = state.trimEnd > 0 ? state.trimEnd : state.videoDuration;
    if (current >= end) {
        // If start is after end, push end to max or reset
        end = state.videoDuration;
        state.trimEnd = end;
    }


    state.trimStart = current;
    state.userManuallyTrimmed = true;
    updateTrimVisuals();
    captureTimelineThumbnail('start', current);
    console.log(`Trim Start set to: ${current.toFixed(2)}s`);
}

function setTrimEnd() {
    if (!el.sourceVideo || !state.videoDuration) return;
    const current = el.sourceVideo.currentTime;

    // Validate
    if (current <= state.trimStart) {
        alert("El punto final debe ser posterior al inicial.");
        return;
    }

    state.trimEnd = current;
    state.userManuallyTrimmed = true;
    updateTrimVisuals();
    captureTimelineThumbnail('end', current);
    console.log(`Trim End set to: ${current.toFixed(2)}s`);
}

function resetTrim() {
    state.trimStart = 0;
    state.trimEnd = state.videoDuration; // Explicit full duration
    state.userManuallyTrimmed = false;
    updateTrimVisuals();
    initTimelinePreviews(); // Resets thumbnails
}

function updateTrimVisuals() {
    if (!el.trimHighlight || !state.videoDuration) return;

    const startPct = (state.trimStart / state.videoDuration) * 100;
    // If trimEnd is 0 (uninitialized for new file), use 100%
    const endT = state.trimEnd > 0 ? state.trimEnd : state.videoDuration;
    const endPct = (endT / state.videoDuration) * 100;

    const width = Math.max(0, endPct - startPct);

    el.trimHighlight.style.left = `${startPct}%`;
    el.trimHighlight.style.width = `${width}%`;

    if (el.trimHandleStart) el.trimHandleStart.style.left = `${startPct}%`;
    if (el.trimHandleEnd) el.trimHandleEnd.style.left = `${endPct}%`;
}

function setupDraggableHandle(handle, type) {
    if (!handle) return;

    const onMove = (e) => {
        if (!state.videoDuration) return;

        const rect = el.scrubberWrapper.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;

        let pct = (clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));

        const newTime = pct * state.videoDuration;

        if (type === 'start') {
            const currentEnd = state.trimEnd > 0 ? state.trimEnd : state.videoDuration;
            // Prevent crossing
            state.trimStart = Math.min(newTime, currentEnd - 0.1);
            if (state.trimStart < 0) state.trimStart = 0;
            state.userManuallyTrimmed = true;

            el.sourceVideo.currentTime = state.trimStart;
            drawFrame(); // Update main preview
            captureTimelineThumbnail('start', state.trimStart);
        } else {
            const currentStart = state.trimStart;
            state.trimEnd = Math.max(newTime, currentStart + 0.1);
            if (state.trimEnd > state.videoDuration) state.trimEnd = state.videoDuration;
            state.userManuallyTrimmed = true;

            el.sourceVideo.currentTime = state.trimEnd;
            drawFrame(); // Update main preview
            captureTimelineThumbnail('end', state.trimEnd);
        }

        updateTrimVisuals();
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
    };

    const onDown = (e) => {
        e.preventDefault();
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove);
        document.addEventListener('touchend', onUp);
    };

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown);
}

// ===== Utils =====
function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [0, 0, 0];
}

function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Check for file protocol issues
        if (window.location.protocol === 'file:') {
            console.warn('Detectado protocolo file://. Es posible que la IA no cargue por seguridad.');
            alert('⚠️ Aviso: Estás ejecutando la app directamente como archivo.\n\nPor seguridad, los navegadores bloquean la IA local en este modo.\n\nPor favor, cierra esto y dale doble clic al archivo "run_app.command" para iniciarla correctamente.');
        }

        console.log('🚀 Initializing Elements...');
        initElements();

        console.log('🎧 Initializing Events...');
        initEvents();

        // console.log('🤖 Preloading AI...');
        // preloadAI(); // Removed

        console.log('✅ Video to Pixel Art ready!');
    } catch (error) {
        console.error('CRITICAL INITIALIZATION ERROR:', error);
        alert('Error Crítico al iniciar la app:\n' + error.message + '\n\nRevisa la consola para más detalles.');
    }
});
