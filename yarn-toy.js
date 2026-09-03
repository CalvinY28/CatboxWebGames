const yarnToy = document.querySelector("#yarn-toy");
const yarnBall = document.querySelector("#yarn-ball");
const yarnStringPath = document.querySelector("#yarn-string-path");
const yarnStringShadow = document.querySelector("#yarn-string-shadow");
const yarnStringSegments = document.querySelector("#yarn-string-segments");

const yarnGravity = 1350;
const yarnSpringStrength = 60;
const yarnSpringDamping = 2;
const yarnMaximumStretch = 7;
const yarnEdgeBounce = 0.75;
const yarnSegmentSpacing = 10;
const yarnSegmentLength = 13;
const yarnSegmentThickness = 10;
const yarnSvgNamespace = "http://www.w3.org/2000/svg";
const yarnSegmentPool = [];

const yarnState = {
  anchorX: 0,
  anchorY: -12,
  ropeLength: 280,
  radius: 90,
  x: 0,
  y: 0,
  velocityX: 0,
  velocityY: 0,
  rotation: 0,
  dragging: false,
  pointerId: null,
  grabOffsetX: 0,
  grabOffsetY: 0,
  pointerClientX: 0,
  pointerClientY: 0,
  lastPointerTime: 0,
  initialized: false,
};

function clampYarn(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getYarnLayout() {
  const width = yarnToy.clientWidth || window.innerWidth;
  const ballSize = yarnBall.getBoundingClientRect().width;
  let ropeLength;

  if (width < 560) {
    ropeLength = 130;
  } else if (width < 900) {
    ropeLength = 190;
  } else if (width < 1280) {
    ropeLength = 225;
  } else {
    ropeLength = clampYarn(window.innerHeight * 0.36, 250, 330);
  }

  return {
    width: width,
    radius: ballSize / 2,
    anchorX: width < 700
      ? clampYarn(width * 0.2, 62, 86)
      : clampYarn(width * 0.1, 96, 175),
    ropeLength: ropeLength,
  };
}

function constrainYarnMaximumStretch() {
  const differenceX = yarnState.x - yarnState.anchorX;
  const differenceY = yarnState.y - yarnState.anchorY;
  const distance = Math.hypot(differenceX, differenceY) || 1;
  const maximumLength = yarnState.ropeLength * yarnMaximumStretch;

  if (distance <= maximumLength) return;

  const normalX = differenceX / distance;
  const normalY = differenceY / distance;
  yarnState.x = yarnState.anchorX + normalX * maximumLength;
  yarnState.y = yarnState.anchorY + normalY * maximumLength;

  const outwardVelocity = yarnState.velocityX * normalX + yarnState.velocityY * normalY;
  if (outwardVelocity > 0) {
    yarnState.velocityX -= outwardVelocity * normalX * 1.08;
    yarnState.velocityY -= outwardVelocity * normalY * 1.08;
  }
}

function applyYarnSpring(elapsedSeconds) {
  const differenceX = yarnState.x - yarnState.anchorX;
  const differenceY = yarnState.y - yarnState.anchorY;
  const distance = Math.hypot(differenceX, differenceY) || 1;
  const extension = distance - yarnState.ropeLength;
  if (extension <= 0) return;

  const normalX = differenceX / distance;
  const normalY = differenceY / distance;
  const outwardVelocity = yarnState.velocityX * normalX + yarnState.velocityY * normalY;
  const tension = Math.max(
    0,
    yarnSpringStrength * extension + yarnSpringDamping * outwardVelocity,
  );

  yarnState.velocityX -= tension * normalX * elapsedSeconds;
  yarnState.velocityY -= tension * normalY * elapsedSeconds;
}

function constrainYarnToScreen() {
  const width = yarnToy.clientWidth || window.innerWidth;
  const height = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    window.innerHeight,
  );
  const minimumX = yarnState.radius;
  const maximumX = width - yarnState.radius;
  const minimumY = yarnState.radius;
  const maximumY = Math.max(minimumY, height - yarnState.radius);

  if (yarnState.x < minimumX) {
    yarnState.x = minimumX;
    yarnState.velocityX = Math.abs(yarnState.velocityX) * yarnEdgeBounce;
  } else if (yarnState.x > maximumX) {
    yarnState.x = maximumX;
    yarnState.velocityX = -Math.abs(yarnState.velocityX) * yarnEdgeBounce;
  }

  if (yarnState.y < minimumY) {
    yarnState.y = minimumY;
    yarnState.velocityY = Math.abs(yarnState.velocityY) * yarnEdgeBounce;
  } else if (yarnState.y > maximumY) {
    yarnState.y = maximumY;
    yarnState.velocityY = -Math.abs(yarnState.velocityY) * yarnEdgeBounce;
  }
}

function constrainYarnBall() {
  constrainYarnMaximumStretch();
  constrainYarnToScreen();
  constrainYarnMaximumStretch();
  constrainYarnToScreen();
}

function createYarnSegment() {
  const segment = document.createElementNS(yarnSvgNamespace, "image");
  segment.setAttribute("class", "yarn-rope-segment");
  segment.setAttribute("href", yarnStringSegments.dataset.segmentSrc);
  segment.setAttribute("preserveAspectRatio", "none");
  segment.setAttribute("x", String(-yarnSegmentLength / 2));
  segment.setAttribute("y", String(-yarnSegmentThickness / 2));
  segment.setAttribute("width", String(yarnSegmentLength));
  segment.setAttribute("height", String(yarnSegmentThickness));
  yarnStringSegments.appendChild(segment);
  yarnSegmentPool.push(segment);
  return segment;
}

function placeYarnTexture() {
  const pathLength = yarnStringPath.getTotalLength();
  const segmentCount = Math.max(1, Math.ceil(pathLength / yarnSegmentSpacing));

  while (yarnSegmentPool.length < segmentCount) {
    createYarnSegment();
  }

  for (let index = 0; index < yarnSegmentPool.length; index += 1) {
    const segment = yarnSegmentPool[index];
    if (index >= segmentCount) {
      segment.style.display = "none";
      continue;
    }

    const distance = Math.min(
      index * yarnSegmentSpacing + yarnSegmentSpacing / 2,
      pathLength,
    );
    const point = yarnStringPath.getPointAtLength(distance);
    const previousPoint = yarnStringPath.getPointAtLength(Math.max(0, distance - 1));
    const nextPoint = yarnStringPath.getPointAtLength(Math.min(pathLength, distance + 1));
    const angle = Math.atan2(
      nextPoint.y - previousPoint.y,
      nextPoint.x - previousPoint.x,
    ) * 180 / Math.PI;

    segment.style.display = "";
    segment.setAttribute("transform", "translate(" + point.x + " " + point.y + ") rotate(" + angle + ")");
  }
}

function drawYarnToy() {
  const differenceX = yarnState.anchorX - yarnState.x;
  const differenceY = yarnState.anchorY - yarnState.y;
  const distance = Math.hypot(differenceX, differenceY) || 1;
  const attachmentX = yarnState.x + differenceX / distance * yarnState.radius * 0.76;
  const attachmentY = yarnState.y + differenceY / distance * yarnState.radius * 0.76;
  const stretch = Math.max(0, distance - yarnState.ropeLength);
  const looseness = 1 - clampYarn(stretch / (yarnState.ropeLength * 0.22), 0, 1);
  const curveX = (yarnState.anchorX + attachmentX) / 2
    - clampYarn(yarnState.velocityX * 0.008, -24, 24);
  const curveY = (yarnState.anchorY + attachmentY) / 2
    + Math.min(48, Math.abs(attachmentX - yarnState.anchorX) * 0.18) * looseness;
  const ropePath = "M " + yarnState.anchorX + " " + yarnState.anchorY
    + " Q " + curveX + " " + curveY
    + " " + attachmentX + " " + attachmentY;

  yarnBall.style.transform = "translate3d("
    + (yarnState.x - yarnState.radius) + "px, "
    + (yarnState.y - yarnState.radius) + "px, 0) rotate("
    + yarnState.rotation + "deg)";
  yarnStringPath.setAttribute(
    "d",
    ropePath,
  );
  yarnStringShadow.setAttribute("d", ropePath);
  placeYarnTexture();
}

function updateYarnLayout() {
  const oldAnchorX = yarnState.anchorX;
  const layout = getYarnLayout();
  yarnState.anchorX = layout.anchorX;
  yarnState.radius = layout.radius;
  yarnState.ropeLength = layout.ropeLength;

  if (!yarnState.initialized) {
    const restingAngle = 0.08;
    yarnState.x = yarnState.anchorX + Math.sin(restingAngle) * yarnState.ropeLength;
    yarnState.y = yarnState.anchorY + Math.cos(restingAngle) * yarnState.ropeLength;
    yarnState.initialized = true;
  } else {
    yarnState.x += yarnState.anchorX - oldAnchorX;
    constrainYarnBall();
  }

  drawYarnToy();
}

function getPointerPosition(event) {
  const bounds = yarnToy.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function updateYarnDragAutoScroll(elapsedSeconds) {
  const edgeZone = 72;
  const maximumSpeed = 900;
  const pageHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    window.innerHeight,
  );
  const maximumScroll = Math.max(0, pageHeight - window.innerHeight);
  let scrollSpeed = 0;

  if (yarnState.pointerClientY > window.innerHeight - edgeZone) {
    const strength = clampYarn(
      (yarnState.pointerClientY - (window.innerHeight - edgeZone)) / edgeZone,
      0,
      1,
    );
    scrollSpeed = maximumSpeed * strength;
  } else if (yarnState.pointerClientY < edgeZone) {
    const strength = clampYarn((edgeZone - yarnState.pointerClientY) / edgeZone, 0, 1);
    scrollSpeed = -maximumSpeed * strength;
  }

  const oldScrollY = window.scrollY;
  const scrollAmount = clampYarn(
    scrollSpeed * elapsedSeconds,
    -oldScrollY,
    maximumScroll - oldScrollY,
  );
  if (Math.abs(scrollAmount) < 0.01) return;

  window.scrollBy(0, scrollAmount);
  const bounds = yarnToy.getBoundingClientRect();
  yarnState.x = yarnState.pointerClientX - bounds.left - yarnState.grabOffsetX;
  yarnState.y = yarnState.pointerClientY - bounds.top - yarnState.grabOffsetY;
  constrainYarnBall();
  drawYarnToy();
}

function beginYarnDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const pointer = getPointerPosition(event);
  yarnState.dragging = true;
  yarnState.pointerId = event.pointerId;
  yarnState.grabOffsetX = pointer.x - yarnState.x;
  yarnState.grabOffsetY = pointer.y - yarnState.y;
  yarnState.pointerClientX = event.clientX;
  yarnState.pointerClientY = event.clientY;
  yarnState.lastPointerTime = performance.now();
  yarnState.velocityX = 0;
  yarnState.velocityY = 0;
  yarnBall.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function moveYarnDrag(event) {
  if (!yarnState.dragging || event.pointerId !== yarnState.pointerId) return;
  const pointer = getPointerPosition(event);
  const previousX = yarnState.x;
  const previousY = yarnState.y;
  const currentTime = performance.now();
  const elapsedSeconds = Math.max((currentTime - yarnState.lastPointerTime) / 1000, 0.008);

  yarnState.pointerClientX = event.clientX;
  yarnState.pointerClientY = event.clientY;
  yarnState.x = pointer.x - yarnState.grabOffsetX;
  yarnState.y = pointer.y - yarnState.grabOffsetY;
  constrainYarnBall();

  yarnState.velocityX = clampYarn((yarnState.x - previousX) / elapsedSeconds, -1800, 1800);
  yarnState.velocityY = clampYarn((yarnState.y - previousY) / elapsedSeconds, -1800, 1800);
  yarnState.lastPointerTime = currentTime;
  drawYarnToy();
  event.preventDefault();
}

function endYarnDrag(event) {
  if (!yarnState.dragging || event.pointerId !== yarnState.pointerId) return;
  yarnState.dragging = false;
  yarnState.pointerId = null;

  if (performance.now() - yarnState.lastPointerTime > 90) {
    yarnState.velocityX = 0;
    yarnState.velocityY = 0;
  }
}

function nudgeYarnBall(event) {
  if (event.key === "ArrowLeft") {
    yarnState.velocityX -= 480;
  } else if (event.key === "ArrowRight") {
    yarnState.velocityX += 480;
  } else if (event.key === "ArrowUp") {
    yarnState.velocityY -= 420;
  } else if (event.key === "ArrowDown") {
    yarnState.velocityY += 360;
  } else {
    return;
  }
  event.preventDefault();
}

let previousFrameTime = performance.now();

function animateYarnBall(frameTime) {
  const elapsedSeconds = Math.min((frameTime - previousFrameTime) / 1000, 0.032);
  previousFrameTime = frameTime;

  if (!yarnState.dragging) {
    yarnState.velocityY += yarnGravity * elapsedSeconds;
    applyYarnSpring(elapsedSeconds);
    yarnState.x += yarnState.velocityX * elapsedSeconds;
    yarnState.y += yarnState.velocityY * elapsedSeconds;

    const damping = Math.pow(0.68, elapsedSeconds);
    yarnState.velocityX *= damping;
    yarnState.velocityY *= damping;
    yarnState.rotation += yarnState.velocityX * elapsedSeconds * 0.08;

    constrainYarnBall();
    drawYarnToy();
  } else {
    updateYarnDragAutoScroll(elapsedSeconds);
  }

  window.requestAnimationFrame(animateYarnBall);
}

yarnBall.addEventListener("pointerdown", beginYarnDrag);
yarnBall.addEventListener("pointermove", moveYarnDrag);
yarnBall.addEventListener("pointerup", endYarnDrag);
yarnBall.addEventListener("pointercancel", endYarnDrag);
yarnBall.addEventListener("keydown", nudgeYarnBall);
yarnBall.addEventListener("dragstart", function (event) {
  event.preventDefault();
});

window.addEventListener("resize", updateYarnLayout);
document.addEventListener("visibilitychange", function () {
  previousFrameTime = performance.now();
});

updateYarnLayout();
window.requestAnimationFrame(animateYarnBall);
