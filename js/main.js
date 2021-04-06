'use strict';

import { XRControllerModelFactory } from '../node_modules/three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from '../node_modules/three/examples/jsm/webxr/XRHandModelFactory.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';

// get count from URL
var count = 10000;
var q = getQueryParams();
if (q.count) count = parseInt(q.count);
$('#input-count').val(count);
console.log('Count: ', count);

// check for VR
var mode = q.mode ? q.mode : 'xr';
var isXR = (mode == 'xr');
$('#input-mode').val(mode);
if (!isXR) $('.change-mode').text('Switch to XR mode');

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

var $el, w, h, scene, camera, renderer, controls, group;
var firstLoaded = false;
var geometry, material;
var pointGeo;
var mesh;
var transitionStart, transitionEnd;
var isTransitioning = false;

//controllers & Hands
var controller1, controller2;
var controllerGrip1, controllerGrip2;
var hand1, hand2;

var raycaster;
var pointRaycaster;
var highlighter1, highlighter2;
var pointsMesh;

const intersected = [];
const tempMatrix = new THREE.Matrix4();

//model
//var model;
var objects = [];

//object
var object = new THREE.Object3D();

//Camera move
var dolly;
var cameraVector = new THREE.Vector3(); // create once and reuse it!
// a variable to store the values from the last polling of the gamepads
const prevGamePads = new Map();

//default values for speed movement of each axis
var speedFactor = [0.1, 0.1, 0.1, 0.1];
//

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

function loadControllers(){
  controller1 = renderer.xr.getController( 0 );
  controller1.addEventListener( 'selectstart', onSelectStart );
  controller1.addEventListener( 'selectend', onSelectEnd );
  scene.add( controller1 );

  controller2 = renderer.xr.getController( 1 );
  controller2.addEventListener( 'selectstart', onSelectStart );
  controller2.addEventListener( 'selectend', onSelectEnd );
  scene.add( controller2 );

  const controllerModelFactory = new XRControllerModelFactory();
  const handModelFactory = new XRHandModelFactory().setPath( '../content/hand/' ); // "../node_modules/three/examples/models/fbx/" ); 

  //Hand 1
  controllerGrip1 = renderer.xr.getControllerGrip( 0 );
  controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
  scene.add( controllerGrip1 );

  hand1 = renderer.xr.getHand( 0 );
  hand1.add( handModelFactory.createHandModel( hand1, "oculus" ) );

  scene.add( hand1 );

  //Hand 2
  controllerGrip2 = renderer.xr.getControllerGrip( 1 );
  controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
  scene.add( controllerGrip2 ); 

  hand2 = renderer.xr.getHand( 1 );
  hand2.add( handModelFactory.createHandModel( hand2, "oculus" ) );
  scene.add( hand2 );
}

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

  // load point geometry for raycasting
  pointGeo = new THREE.BufferGeometry();
  pointGeo.setAttribute( 'position', new THREE.BufferAttribute( translateDestArr, 3 ) );
  pointGeo.setAttribute( 'color', new THREE.BufferAttribute( colorArr, 3 ) );
  pointGeo.computeBoundingBox();
  var pointMat = new THREE.PointsMaterial( { size: cellW, vertexColors: true } );
  pointsMesh = new THREE.Points( pointGeo, pointMat );
  pointsMesh.visible = false;
  pointsMesh.layers.enable( 7 );
  scene.add( pointsMesh );

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
    mesh.frustumCulled = false;

    const obj = new THREE.Mesh( geometry, material );

    scene.add(mesh);
    //group.add(obj);

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

  $('.change-mode').on('click', function(){
    if (isXR) $('#input-mode').val('web');
    else $('#input-mode').val('xr');
    $('#form').submit();
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
  camera = new THREE.PerspectiveCamera( 75, w / h, 0.0001, 8000 );
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setClearColor( 0x000000, 0.0 );
  renderer.setSize(w, h);
  $el.append(renderer.domElement);

  const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );

  loadControllers();

  const line = new THREE.Line( geometry );
  line.name = 'line';
  line.scale.z = 5;

  controller1.add( line.clone() );
  controller2.add( line.clone() );

  raycaster = new THREE.Raycaster();

  pointRaycaster = new THREE.Raycaster();
  pointRaycaster.params.Points.threshold = cellW / 2;
  pointRaycaster.layers.set( 7 );
  const highlightGeo1 = new THREE.SphereGeometry( 16, 32, 32 );
  const highlightGeo2 = new THREE.SphereGeometry( 16, 32, 32 );
  const highlightMat1 = new THREE.MeshBasicMaterial( {color: 0x00ff00, transparent: true} );
  const highlightMat2 = new THREE.MeshBasicMaterial( {color: 0xff0000, transparent: true} );
  highlighter1 = new THREE.Mesh( highlightGeo1, highlightMat1 );
  highlighter1.opacity = 0.5;
  highlighter1.visible = false;
  highlighter2 = new THREE.Mesh( highlightGeo2, highlightMat2 );
  highlighter2.opacity = 0.5;
  highlighter2.visible = false;
  scene.add( highlighter1 );
  scene.add( highlighter2 );

  //Dolly for camera
  dolly = new THREE.Group();
  dolly.position.set(0, 0, 0);
  dolly.name = "dolly";
  scene.add(dolly);
  dolly.add(camera);
  //add the controls to the dolly also or they will not move with the dolly
  dolly.add(controller1);
  dolly.add(controller2);
  dolly.add(controllerGrip1);
  dolly.add(controllerGrip2);
  //

  group = new THREE.Group();
  scene.add(group);

  //for (var i=0; i< ITEM_NAMES.length; i++) {  
    drawTestObjects(0);

  //}
  
  //var object = group.getObjectByName( ITEM_NAMES[0]);
  //children[0].parent.position.x -= group.children.length*0.3;


  drawUI();
  
  group.position.y+=1;  
  group.position.z-=2;  
  group.rotation.x = -0.55*Math.PI;
  group.rotation.z = Math.PI;
  group.scale.set(0.05,0.05,0.05); // scale here


  //group.children[0].parent.position.x +=0.5;
  //group.children[1].parent.position.x -=0.5;

//Light
const light = new THREE.DirectionalLight( 0xffffff );
  light.position.set( 0, 6, 0 );
  light.castShadow = false;
  light.shadow.camera.top = 2;
  light.shadow.camera.bottom = - 2;
  light.shadow.camera.right = 2;
  light.shadow.camera.left = - 2;
  light.shadow.mapSize.set( 4096, 4096 );
  scene.add( light );

  var ambient = new THREE.AmbientLight( 0xffffff );
  scene.add(ambient);
//

  if (isXR) {
  document.body.appendChild( VRButton.createButton( renderer ) );
  renderer.xr.enabled = true;
  } else {
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  }

  camera.position.set(256, 256, 256);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  // var axesHelper = new THREE.AxesHelper( 4096 );
  // scene.add( axesHelper );
  //
  // var gridHelper = new THREE.GridHelper( 1024, 64 );
  // scene.add( gridHelper );

  //render();
  loadCollection();

  window.addEventListener( 'resize', onWindowResize );
}

function randomizePositions(){
  var positions = getRandomPositions(count, worldWidth);
  var translateDestArr = geometry.getAttribute('translateDest').array;
  var pointPosArr = pointGeo.getAttribute('position').array;
  for (var i=0; i<count; i++) {
    var i0 = i*3;
    translateDestArr[i0] = positions[i][0];
    translateDestArr[i0+1] = positions[i][1];
    translateDestArr[i0+2] = positions[i][2];
    pointPosArr[i0] = positions[i][0];
    pointPosArr[i0+1] = positions[i][1];
    pointPosArr[i0+2] = positions[i][2];
  }
  geometry.getAttribute('translateDest').needsUpdate = true;
  pointGeo.getAttribute('position').needsUpdate = true;

  transitionStart = new Date().getTime();
  transitionEnd = transitionStart + transitionDuration;
  isTransitioning = true;
}

function rotateModel(){
  var timer = Date.now() * 0.0001;

  group.children.forEach( item => {
    if (item) item.rotation.z = 0.25*Math.PI + (Math.abs(Math.sin( timer )) * 4);
  });
}

function render(){

  if (isXR) {
      renderer.setAnimationLoop( function () {

      //rotateModel();

      transition();

      cleanIntersected();

      intersectObjects( controller1 );
      intersectObjects( controller2 );

      intersectPoints( controller1, 0 );
      intersectPoints( controller2, 1 );

      //add gamepad polling for webxr to renderloop
      VRCameraControls(dolly, prevGamePads, speedFactor, camera, cameraVector, renderer);

      renderer.render( scene, camera );
    });

  } else {
    transition();
    renderer.render(scene, camera);
    controls.update();
    intersectFromCursor();
    requestAnimationFrame(function(){
    render();
    });
  }
};

function transition(){
  if (!isTransitioning) return;

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

function animate() {
  renderer.setAnimationLoop( render );
}

//functions
function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( window.innerWidth, window.innerHeight );

}

function onSelectStart( event ) {

  const controller = event.target;

  const intersections = getIntersections( controller );

  if ( intersections.length > 0 ) {
    const intersection = intersections[ 0 ];

    const object = intersection.object;
    object.material.emissive.b = 0.2;
    controller.attach( object );

    controller.userData.selected = object;

    console.log("SELECTED OBJECT:  " + object.name);  
  }
}

function getContainerObjByChild(obj) {
  
   if(obj.userData.isContainer) return obj

   else if(obj.parent != null) return getContainerObjByChild(obj.parent)

   else return null
}

function onSelectEnd( event ) {

  const controller = event.target;

  if ( controller.userData.selected !== undefined ) {

    const object = controller.userData.selected;
    object.material.emissive.b = 0;
    group.attach( object );

    controller.userData.selected = undefined;

  }
}

//Controllers
function getIntersections( controller, targetObjects, theRaycaster ) {
  theRaycaster = theRaycaster || raycaster;

  tempMatrix.identity().extractRotation( controller.matrixWorld );

  theRaycaster.ray.origin.setFromMatrixPosition( controller.matrixWorld );
  theRaycaster.ray.direction.set( 0, 0, - 1 ).applyMatrix4( tempMatrix );

  targetObjects = targetObjects || group.children;
  return theRaycaster.intersectObjects( targetObjects );
}

function intersectObjects( controller ) {

  // Do not highlight when already selected

  if ( controller.userData.selected !== undefined ) return;

  const line = controller.getObjectByName( 'line' );
  const intersections = getIntersections( controller );

  if ( intersections.length > 0 ) {

    const intersection = intersections[ 0 ];

    const object = intersection.object;
    object.material.emissive.r = 0.2;
    intersected.push( object );

    line.scale.z = intersection.distance;

  } else {

    line.scale.z = 5;

  }
}

function intersectPoints( controller, index ){
  const intersections = getIntersections( controller, [pointsMesh], pointRaycaster );
  const highlighter = index <= 0 ? highlighter1 : highlighter2;
  highlighter.visible = false;

  if ( intersections && intersections.length > 0 ) {

    const intersection = intersections[ 0 ];
    var index = intersection.index;
    var pointPosArr = pointGeo.getAttribute('position').array;
    var x = pointPosArr[ 3 * index ];
    var y = pointPosArr[ 3 * index + 1 ];
    var z = pointPosArr[ 3 * index + 2 ];
    highlighter1.position.set(x, y, z);
    highlighter1.visible = true;

  }
}

var mouse = new THREE.Vector2();
function onDocumentMouseMove( event ) {
  event.preventDefault();
  mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
  mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}
document.addEventListener( 'mousemove', onDocumentMouseMove, false );

function intersectFromCursor(){
  pointRaycaster.setFromCamera( mouse, camera );
  var intersections = pointRaycaster.intersectObjects( [pointsMesh] );
  var intersection = ( intersections.length ) > 0 ? intersections[ 0 ] : null;

  if ( intersection !== null ) {
    var index = intersection.index;
    var pointPosArr = pointGeo.getAttribute('position').array;
    var x = pointPosArr[ 3 * index ];
    var y = pointPosArr[ 3 * index + 1 ];
    var z = pointPosArr[ 3 * index + 2 ];
    highlighter1.position.set(x, y, z);
    highlighter1.visible = true;
  } else {
    highlighter1.visible = false;
  }
}

function cleanIntersected() {

  while ( intersected.length ) {

    const object = intersected.pop();
    object.material.emissive.r = 0;

  }
}

var ITEM_NAMES = ['bracelet_cleaned', 'beardish_cleaned'];

function drawTestObjects( index ) {

const loader = new GLTFLoader().setPath( '../content/haida/' );
loader.load( ITEM_NAMES[index]+ '.gltf', function ( gltf ) {
  var model = gltf.scene;
  model.name = ITEM_NAMES[index]; // OR
  model.userData.isContainer = true;
  /*
  model.position.y+=1;  
  model.position.z-=2;  
  model.rotation.x = -0.55*Math.PI;
  model.rotation.z = Math.PI;
  model.scale.set(0.025,0.025,0.025); // scale here
  */

  model.traverse( function ( child ) {
        if ( child.isMesh ) {
            child.geometry.center(); // center here

            object = child; 
            group.add( object ); 
            console.log("group size: " + group.children.length);   
            console.log("item 0's name?  " + group.children[0].parent.position.x); 
        }
        if ( child.material ) child.material.metalness = 0.5;
    });


  scene.add( model );

}, (xhr) => xhr, ( err ) => console.error( e ));

}

function drawTestGeoms() {
// Geometries for testing
  const geometries = [
  new THREE.BoxGeometry( 0.2, 0.2, 0.2 ),
  new THREE.ConeGeometry( 0.2, 0.2, 64 ),
  new THREE.CylinderGeometry( 0.2, 0.2, 0.2, 64 ),
  new THREE.IcosahedronGeometry( 0.2, 8 ),
  new THREE.TorusGeometry( 0.2, 0.04, 64, 32 )
  ];

  for ( let i = 0; i < 20; i ++ ) {
    const geometry = geometries[ Math.floor( Math.random() * geometries.length ) ];   
    const material = new THREE.MeshStandardMaterial( {
      color: Math.random() * 0xffffff,
      roughness: 0.7,
      metalness: 0.0
    } );

    const object = new THREE.Mesh( geometry, material );

    object.position.x = Math.random() * 4 - 2;
    object.position.y = Math.random() * 2;
    object.position.z = Math.random() * 4 - 2;

    object.rotation.x = Math.random() * 2 * Math.PI;
    object.rotation.y = Math.random() * 2 * Math.PI;
    object.rotation.z = Math.random() * 2 * Math.PI;

    object.scale.setScalar( Math.random() + 0.5 );

    object.castShadow = false;
    object.receiveShadow = false;

    group.add( object );
  }
}

function drawUI() {

  var loader = new THREE.TextureLoader();
  var texture = loader.load( '../img/ui-bracelet.png' );
  
  const geometry = new THREE.PlaneGeometry( 12*0.6, 17.18*0.6, 16 ); //new THREE.PlaneGeometry( 19, 12, 32 );
  const material = new THREE.MeshBasicMaterial( { map: texture, opacity: 0.8, transparent: true,  depthWrite: true, blending: THREE.NormalBlending } );

  const UIMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8,
      depthWrite: false, 
      depthTest: false 
  });

  const plane = new THREE.Mesh( geometry, material );
  plane.position.set(0, 0, camera.position.z -10); //plane.position.z = camera.position.z -30;
  plane.quaternion.copy( camera.quaternion );
  scene.add( plane );
  /*
  const label = new THREE.Sprite(UIMaterial);
  label.position.set(3, 3, camera.position.z -5);
  label.width = 40;
  label.height = 24;
  label.quaternion.copy( camera.quaternion );
  scene.add( label );

  var testGeo = new THREE.PlaneBufferGeometry();
  var testMat = new THREE.MeshBasicMaterial( { map: texture, opacity: 0.8, transparent: true,  depthWrite: false, depthTest: false  } );

  var testMesh = new THREE.Mesh( testGeo, testMat );
  testMesh.position.set(-3, 3, camera.position.z -5);
  testMesh.quaternion.copy( camera.quaternion );
  testMesh.width = 80;
  testMesh.height = 48;
  scene.add( testMesh );
  */
}


loadScene();
animate();
