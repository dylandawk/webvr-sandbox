'use strict';

// get count from URL
var count = 10000;
var q = getQueryParams();
if (q.count) count = parseInt(q.count);
$('#input-count').val(count);
console.log('Count: ', count);

var worldWidth = 4096;
var textureUrl = 'img/texture.jpg';
var imageW = 4096;
var imageH = 4096;
var cellW = 16;
var cellH = 16;
var cols = parseInt(imageW / cellW);
var rows = parseInt(imageH / cellH);
var cellCount = cols * rows;
var transitionDuration = 4000;

var $el, w, h, scene, camera, renderer, controls;
var firstLoaded = false;
var geometry, material, mesh;
var transitionStart, transitionEnd;
var isTransitioning = false;

var MaterialVertexShader = `
  precision mediump float;

  uniform float positionTransitionPct;

  attribute vec2 uvOffset;
  attribute vec3 translate;
  attribute vec3 translateDest;
  attribute vec3 actualSize;
  attribute vec3 color;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vUidColor;
  varying float vAlpha;

  #define PI 3.14159
  void main() {
    float pPct = positionTransitionPct;
    if (pPct > 1.0) pPct = 1.0;

    vec3 p = mix( translate, translateDest, pPct );
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    mvPosition.xyz += position * actualSize;
    vUv = uvOffset.xy + uv * actualSize.xy;

    vColor = color;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

var MaterialFragmentShader = `
  precision mediump float;

  uniform sampler2D map;
  uniform vec3 fogColor;
  uniform float fogDistance;

  varying vec2 vUv;
  varying vec3 vColor;

  void main() {
    if( length( vColor ) < .1 )discard;

    //fog
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float d = clamp( 0., 1., pow( depth * ( 1./fogDistance ), 2. ) );
    if( d >= 1. ) discard;

    vec4 diffuseColor = texture2D(map, vUv);
    gl_FragColor = diffuseColor * vec4(vColor, 1.0);
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, d );
    gl_FragColor.a = 1.;
  }
`;

function loadCollection() {

  // create the geometry
  var planeGeom = new THREE.PlaneBufferGeometry(1, 1);
  geometry = new THREE.InstancedBufferGeometry();
  geometry.copy(planeGeom);
  geometry.instanceCount = count;
  var uvAttr = geometry.getAttribute('uv');
  uvAttr.needsUpdate = true;
  for (var i = 0; i < uvAttr.array.length; i++) {
    uvAttr.array[i] /= imageW;
  }
  // define the shader attributes topology
  var attributes = [
    {name: 'uvOffset', size: 2},
    {name: 'translate', size: 3},
    {name: 'translateDest', size: 3},
    {name: 'actualSize', size: 3},
    {name: 'color', size: 3}
  ];
  for (var attr of attributes) {
    // allocate the buffer
    var buffer = new Float32Array(geometry.instanceCount * attr.size);
    var buffAttr = new THREE.InstancedBufferAttribute(buffer, attr.size, false, 1);
    buffAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(attr.name, buffAttr);
  }

  // set uv offset to random cell
  var uvOffsetArr = geometry.getAttribute('uvOffset').array;
  var yt = 1.0/cols;
  for (var i=0; i<count; i++) {
    var randomIndex = getRandomInt(0, cellCount-1);
    var i0 = randomIndex*2;
    var y = parseInt(randomIndex / cols) / cols;
    var x = (randomIndex % cols) / cols;
    uvOffsetArr[i0] = x;
    uvOffsetArr[i0 + 1] = Math.max(1.0-y-yt, 0.0);
  }

  // set translates and colors
  var positions = getRandomPositions(count, worldWidth);
  var sizeArr = geometry.getAttribute('actualSize').array;
  var translateArr = geometry.getAttribute('translate').array;
  var translateDestArr = geometry.getAttribute('translateDest').array;
  var colorArr = geometry.getAttribute('color').array;
  for (var i=0; i<count; i++) {
    var i0 = i*3;
    sizeArr[i0] = cellW;
    sizeArr[i0+1] = cellH;
    sizeArr[i0+2] = 1;
    translateArr[i0] = positions[i][0];
    translateArr[i0+1] = positions[i][1];
    translateArr[i0+2] = positions[i][2];
    translateDestArr[i0] = positions[i][0];
    translateDestArr[i0+1] = positions[i][1];
    translateDestArr[i0+2] = positions[i][2];
    colorArr[i0] = 1;
    colorArr[i0+1] = 1;
    colorArr[i0+2] = 1;
  }

  for (var attr of attributes) {
    geometry.getAttribute(attr.name).needsUpdate = true
  }

  // load texture
  var textureLoader = new THREE.TextureLoader();
  var texture = textureLoader.load(textureUrl, function() {
    console.log('Loaded texture');

    // load material
    material = new THREE.ShaderMaterial({
      uniforms: {
        map: {type: "t", value: texture },
        positionTransitionPct: {type: "f", value: 0.0},
        ///fog
        fogColor: {type: "v3", value: new THREE.Vector3()},
        fogDistance: {type: "f", value: 5000}
      },
      vertexShader: MaterialVertexShader,
      fragmentShader: MaterialFragmentShader,
      depthTest: true,
      depthWrite: true,
      transparent: true
    });
    material.uniforms.positionTransitionPct.value = 1.0;
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // done loading scene
    $('.loading').removeClass('active');
    loadListeners();
    render();
  });
}

function loadListeners(){

  $('.randomize').on('click', function(){
    if (!isTransitioning) randomizePositions();
  });

  $(window).on('resize', function(){
    w = $el.width();
    h = $el.height();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

}

function loadScene(){
  $el = $('#viewer');
  w = $el.width();
  h = $el.height();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera( 75, w / h, 0.001, 8000 );
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setClearColor( 0x000000, 0.0 );
  renderer.setSize(w, h);
  $el.append(renderer.domElement);

  camera.position.set(256, 256, 256);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
  controls = new THREE.OrbitControls(camera, renderer.domElement);

  var axesHelper = new THREE.AxesHelper( 4096 );
  scene.add( axesHelper );

  var gridHelper = new THREE.GridHelper( 1024, 64 );
  scene.add( gridHelper );

  //render();
  loadCollection();
}

function randomizePositions(){
  var positions = getRandomPositions(count, worldWidth);
  var translateDestArr = geometry.getAttribute('translateDest').array;
  for (var i=0; i<count; i++) {
    var i0 = i*3;
    translateDestArr[i0] = positions[i][0];
    translateDestArr[i0+1] = positions[i][1];
    translateDestArr[i0+2] = positions[i][2];
  }
  geometry.getAttribute('translateDest').needsUpdate = true;

  transitionStart = new Date().getTime();
  transitionEnd = transitionStart + transitionDuration;
  isTransitioning = true;
}

function render(){

  if (isTransitioning) {
    var now = new Date().getTime();
    var t = norm(now, transitionStart, transitionEnd);

    if (t >= 1) {
      isTransitioning = false;
      var translateArr = geometry.getAttribute('translate').array;
      var translateDestArr = geometry.getAttribute('translateDest').array;
      for (var i=0; i<count; i++) {
        var i0 = i*3;
        translateArr[i0] = translateDestArr[i0];
        translateArr[i0+1] = translateDestArr[i0+1]
        translateArr[i0+2] = translateDestArr[i0+2]
      }
      geometry.getAttribute('translate').needsUpdate = true;
    } else {
      t = ease(t);
      material.uniforms.positionTransitionPct.value = t;
    }
  }

  renderer.render(scene, camera);
  controls.update();
  requestAnimationFrame(function(){
    render();
  });
};

loadScene();
