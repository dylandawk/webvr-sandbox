function ease(n){
  return (Math.sin((n+1.5)*Math.PI)+1.0) / 2.0;
};

function getQueryParams(){
  if (location.search.length) {
    var search = location.search.substring(1);
    var parsed = JSON.parse('{"' + search.replace(/&/g, '","').replace(/=/g,'":"') + '"}', function(key, value) { return key===""?value:decodeURIComponent(value) });
    $.each(parsed, function(key, value){
      var dkey = decodeURIComponent(key);
      parsed[dkey] = value;
    });
    return parsed;
  }
  return {};
};

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomNumber(min, max){
  return Math.random() * (max - min) + min;
}

function getRandomPointInSphere(center, radius) {
  var phi = getRandomNumber(0, 2*Math.PI);
  var costheta = getRandomNumber(-1, 1);
  var u = Math.random();
  var theta = Math.acos(costheta);
  var r = radius * Math.pow(u, (1./3));
  var x = r * Math.sin(theta) * Math.cos(phi)
  var y = r * Math.sin(theta) * Math.sin(phi)
  var z = r * Math.cos(theta)
  return [center[0]+x, center[1]+y, center[2]+z];
};

function getRandomPositions(count, width){
  var radius = width/2;
  var positions = [];
  for (var i=0; i<count; i++) {
    var newPoint = getRandomPointInSphere([0, 0, 0], radius);
    positions.push(newPoint);
  }
  return positions;
};

function norm(value, a, b){
  var denom = (b - a);
  if (denom > 0 || denom < 0) {
    var n = (1.0 * value - a) / denom;
    n = Math.min(n, 1);
    n = Math.max(n, 0);
    return n;
  } else {
    return 0;
  }
};
