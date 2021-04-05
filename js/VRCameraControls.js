//Camera move in VR
function VRCameraControls(dolly, prevGamePads, speedFactor, camera, cameraVector, renderer) {
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
              console.log("Left Paddle Down - Pressing");
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
              console.log("Right Paddle Down - Pressing");

              // detectIntersections( controller );
              if (i == 1) {
                dolly.rotateY(THREE.Math.degToRad(1));
              }
            }
          } else {
            // console.log("Button" + i + "Up");

            if (i == 1) {
              //use the paddle buttons to rotate
              if (data.handedness == "left") {
                console.log("Left Paddle Down - Releasing");
                dolly.rotateY(-THREE.Math.degToRad(Math.abs(value)));
              } else {
                console.log("Right Paddle Down - Releasing");
                dolly.rotateY(THREE.Math.degToRad(Math.abs(value)));
              }
            }
          }
        }
      });
      data.axes.forEach((value, i) => { ////
        //handlers for thumbsticks
        //if thumbstick axis has moved beyond the minimum threshold from center, windows mixed reality seems to wander up to about .17 with no input
        if (Math.abs(value) > 0.2) {
          //set the speedFactor per axis, with acceleration when holding above threshold, up to a max speed
          speedFactor[i] > 1 ? (speedFactor[i] = 1) : (speedFactor[i] *= 1.001);
          //console.log(value, speedFactor[i], i);
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
              // Rotate when pushing right hand thumbstick to left and right 
              //dolly.rotateY(-THREE.Math.degToRad(data.axes[2])); 
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
            }
            //controls.update(); ////
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
            //controls.update(); ////
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