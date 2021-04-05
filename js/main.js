'use strict';

import { XRControllerModelFactory } from '../node_modules/three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from '../node_modules/three/examples/jsm/webxr/XRHandModelFactory.js';

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
var mesh;
var transitionStart, transitionEnd;
var isTransitioning = false;

//controllers & Hands
var controller1, controller2;
var controllerGrip1, controllerGrip2;
var hand1, hand2;

var raycaster;
var pointRaycaster;

const intersected = [];
const tempMatrix = new THREE.Matrix4();

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

  //controllers -----------------------------
  controller1 = renderer.xr.getController( 0 );
  controller1.addEventListener( 'selectstart', onSelectStart );
  controller1.addEventListener( 'selectend', onSelectEnd );
  scene.add( controller1 );

  controller2 = renderer.xr.getController( 1 );
  controller2.addEventListener( 'selectstart', onSelectStart );
  controller2.addEventListener( 'selectend', onSelectEnd );
  scene.add( controller2 );

  const controllerModelFactory = new XRControllerModelFactory();
  const handModelFactory = new XRHandModelFactory().setPath( "./models/fbx/" );

  //Hand 1
  controllerGrip1 = renderer.xr.getControllerGrip( 0 );
  controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
  scene.add( controllerGrip1 );

  hand1 = renderer.xr.getHand( 0 );
  hand1.add( handModelFactory.createHandModel( hand1 ) );

  scene.add( hand1 );

  //Hand 2
  controllerGrip2 = renderer.xr.getControllerGrip( 1 );
  controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
  scene.add( controllerGrip2 );

  hand2 = renderer.xr.getHand( 1 );
  hand2.add( handModelFactory.createHandModel( hand2 ) );
  scene.add( hand2 );
  //

  const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );

  const line = new THREE.Line( geometry );
  line.name = 'line';
  line.scale.z = 5;

  controller1.add( line.clone() );
  controller2.add( line.clone() );

  raycaster = new THREE.Raycaster();
  pointRaycaster = new THREE.Raycaster();
  pointRaycaster.params.Points.threshold = cellW / 2;

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

  //Geometries for testing
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

    object.castShadow = true;
    object.receiveShadow = true;

    group.add( object );

  }
//

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

  if (isXR) {
    renderer.setAnimationLoop( function () {
      transition();

      cleanIntersected();

      intersectObjects( controller1 );
      intersectObjects( controller2 );

      //add gamepad polling for webxr to renderloop
      //dollyMove();

      renderer.render( scene, camera );
    });

  } else {
    transition();
    renderer.render(scene, camera);
    controls.update();
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
    object.material.emissive.b = 1;
    controller.attach( object );

    controller.userData.selected = object;

  }

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
function getIntersections( controller ) {

  tempMatrix.identity().extractRotation( controller.matrixWorld );

  raycaster.ray.origin.setFromMatrixPosition( controller.matrixWorld );
  raycaster.ray.direction.set( 0, 0, - 1 ).applyMatrix4( tempMatrix );

  return raycaster.intersectObjects( group.children );
}

function intersectObjects( controller ) {

  // Do not highlight when already selected

  if ( controller.userData.selected !== undefined ) return;

  const line = controller.getObjectByName( 'line' );
  const intersections = getIntersections( controller );

  if ( intersections.length > 0 ) {

    const intersection = intersections[ 0 ];

    const object = intersection.object;
    object.material.emissive.r = 1;
    intersected.push( object );

    line.scale.z = intersection.distance;

  } else {

    line.scale.z = 5;

  }

}

function cleanIntersected() {

  while ( intersected.length ) {

    const object = intersected.pop();
    object.material.emissive.r = 0;

  }

}
//

//Camera move in VR
function dollyMove() {
var handedness = "unknown";

//determine if we are in an xr session
const session = renderer.xr.getSession();
let i = 0;

if (session) {
let xrCamera = renderer.xr.getCamera(camera);
xrCamera.getWorldDirection(cameraVector);

//a check to prevent console errors if only one input source
if (isIterable(session.inputSources)) {
for (const source of session.inputSources) {
  if (source && source.handedness) {
    handedness = source.handedness; //left or right controllers
  }
  if (!source.gamepad) continue;
  const controller = renderer.xr.getController(i++);
  const old = prevGamePads.get(source);
  const data = {
    handedness: handedness,
    buttons: source.gamepad.buttons.map((b) => b.value),
    axes: source.gamepad.axes.slice(0)
  };
  if (old) {
    data.buttons.forEach((value, i) => {
      //handlers for buttons
      if (value !== old.buttons[i] || Math.abs(value) > 0.8) {
        //check if it is 'all the way pushed'
        if (value === 1) {
          //console.log("Button" + i + "Down");
          if (data.handedness == "left") {
            //console.log("Left Paddle Down");
            if (i == 1) {
              dolly.rotateY(-THREE.Math.degToRad(1));
            }
            if (i == 3) {
              //reset teleport to home position
              dolly.position.x = 0;
              dolly.position.y = 5;
              dolly.position.z = 0;
            }
          } else {
            //console.log("Right Paddle Down");
            if (i == 1) {
              dolly.rotateY(THREE.Math.degToRad(1));
            }
          }
        } else {
          // console.log("Button" + i + "Up");

          if (i == 1) {
            //use the paddle buttons to rotate
            if (data.handedness == "left") {
              //console.log("Left Paddle Down");
              dolly.rotateY(-THREE.Math.degToRad(Math.abs(value)));
            } else {
              //console.log("Right Paddle Down");
              dolly.rotateY(THREE.Math.degToRad(Math.abs(value)));
            }
          }
        }
      }
    });
    data.axes.forEach((value, i) => {
      //handlers for thumbsticks
      //if thumbstick axis has moved beyond the minimum threshold from center, windows mixed reality seems to wander up to about .17 with no input
      if (Math.abs(value) > 0.2) {
        //set the speedFactor per axis, with acceleration when holding above threshold, up to a max speed
        speedFactor[i] > 1 ? (speedFactor[i] = 1) : (speedFactor[i] *= 1.001);
        console.log(value, speedFactor[i], i);
        if (i == 2) {
          //left and right axis on thumbsticks
          if (data.handedness == "left") {
            // (data.axes[2] > 0) ? console.log('left on left thumbstick') : console.log('right on left thumbstick')

            //move our dolly
            //we reverse the vectors 90degrees so we can do straffing side to side movement
            dolly.position.x -= cameraVector.z * speedFactor[i] * data.axes[2];
            dolly.position.z += cameraVector.x * speedFactor[i] * data.axes[2];

            //provide haptic feedback if available in browser
            if (
              source.gamepad.hapticActuators &&
              source.gamepad.hapticActuators[0]
            ) {
              var pulseStrength = Math.abs(data.axes[2]) + Math.abs(data.axes[3]);
              if (pulseStrength > 0.75) {
                pulseStrength = 0.75;
              }

              var didPulse = source.gamepad.hapticActuators[0].pulse(
                pulseStrength,
                100
              );
            }
          } else {
            // (data.axes[2] > 0) ? console.log('left on right thumbstick') : console.log('right on right thumbstick')
            dolly.rotateY(-THREE.Math.degToRad(data.axes[2]));
          }
          controls.update();
        }

        if (i == 3) {
          //up and down axis on thumbsticks
          if (data.handedness == "left") {
            // (data.axes[3] > 0) ? console.log('up on left thumbstick') : console.log('down on left thumbstick')
            dolly.position.y -= speedFactor[i] * data.axes[3];
            //provide haptic feedback if available in browser
            if (
              source.gamepad.hapticActuators &&
              source.gamepad.hapticActuators[0]
            ) {
              var pulseStrength = Math.abs(data.axes[3]);
              if (pulseStrength > 0.75) {
                pulseStrength = 0.75;
              }
              var didPulse = source.gamepad.hapticActuators[0].pulse(
                pulseStrength,
                100
              );
            }
          } else {
            // (data.axes[3] > 0) ? console.log('up on right thumbstick') : console.log('down on right thumbstick')
            dolly.position.x -= cameraVector.x * speedFactor[i] * data.axes[3];
            dolly.position.z -= cameraVector.z * speedFactor[i] * data.axes[3];

            //provide haptic feedback if available in browser
            if (
              source.gamepad.hapticActuators &&
              source.gamepad.hapticActuators[0]
            ) {
              var pulseStrength = Math.abs(data.axes[2]) + Math.abs(data.axes[3]);
              if (pulseStrength > 0.75) {
                pulseStrength = 0.75;
              }
              var didPulse = source.gamepad.hapticActuators[0].pulse(
                pulseStrength,
                100
              );
            }
          }
          controls.update();
        }
      } else {
        //axis below threshold - reset the speedFactor if it is greater than zero  or 0.025 but below our threshold
        if (Math.abs(value) > 0.025) {
          speedFactor[i] = 0.025;
        }
      }
    });
  }
  prevGamePads.set(source, data);
}
}
}
}

function isIterable(obj) {
// checks for null and undefined
if (obj == null) {
return false;
}
return typeof obj[Symbol.iterator] === "function";
}
//

loadScene();
animate();
