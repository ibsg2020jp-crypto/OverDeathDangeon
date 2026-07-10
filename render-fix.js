'use strict';

// Draw the return wall at the far end of a side opening.
(function () {
  const baseDrawSideOpening = drawSideOpening;

  function drawSideReturnWall(ctx, near, far, side, segment) {
    const left = side === 'left';
    const topNear = left ? [near.x, near.y] : [near.x + near.w, near.y];
    const topFar = left ? [far.x, far.y] : [far.x + far.w, far.y];
    const bottomNear = left
      ? [near.x, near.y + near.h]
      : [near.x + near.w, near.y + near.h];
    const bottomFar = left
      ? [far.x, far.y + far.h]
      : [far.x + far.w, far.y + far.h];
    const points = [
      lerpPoint(topNear, topFar, 0.55),
      topFar,
      bottomFar,
      lerpPoint(bottomNear, bottomFar, 0.55),
    ];
    const shade = Math.max(72, 132 - segment * 16);

    ctx.save();
    pathPoly(ctx, points);
    ctx.fillStyle = `rgb(${shade}, ${Math.max(58, shade - 28)}, ${Math.max(40, shade - 52)})`;
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(2, 4 - segment * 0.5);
    ctx.stroke();
    drawBrickLines(ctx, points, left);
    ctx.restore();
  }

  function drawOpening(ctx, near, far, side, segment) {
    baseDrawSideOpening(ctx, near, far, side);
    const offset = side === 'left' ? -1 : 1;
    const nextSide = viewCell(segment + 1, offset);
    if (isWall(nextSide.x, nextSide.y)) {
      drawSideReturnWall(ctx, near, far, side, segment);
    }
  }

  renderDungeon = function patchedRenderDungeon() {
    const canvas = $('viewCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const planes = [
      { x: 0, y: 0, w, h },
      { x: 48, y: 34, w: 264, h: 192 },
      { x: 104, y: 70, w: 152, h: 118 },
      { x: 140, y: 96, w: 80, h: 68 },
      { x: 164, y: 116, w: 32, h: 30 },
    ];

    ctx.clearRect(0, 0, w, h);
    drawBackground(ctx, w, h);
    drawDepthFog(ctx, planes[4]);

    let frontBlockedDepth = null;
    for (let depth = 1; depth <= 4; depth += 1) {
      const cell = viewCell(depth, 0);
      if (isWall(cell.x, cell.y)) {
        frontBlockedDepth = depth;
        break;
      }
    }

    for (let segment = 3; segment >= 0; segment -= 1) {
      if (!cellIsVisibleBefore(segment)) continue;
      const left = viewCell(segment, -1);
      const right = viewCell(segment, 1);

      if (isWall(left.x, left.y)) {
        drawSideWall(ctx, planes[segment], planes[segment + 1], 'left', segment);
      } else {
        drawOpening(ctx, planes[segment], planes[segment + 1], 'left', segment);
      }

      if (isWall(right.x, right.y)) {
        drawSideWall(ctx, planes[segment], planes[segment + 1], 'right', segment);
      } else {
        drawOpening(ctx, planes[segment], planes[segment + 1], 'right', segment);
      }
    }

    drawCeilingAndFloorLines(ctx, planes);
    if (frontBlockedDepth !== null) {
      drawFrontWall(ctx, planes[frontBlockedDepth], frontBlockedDepth);
    }
    drawViewSprite(frontBlockedDepth);
  };
})();
