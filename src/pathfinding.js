import EasyStar from "easystarjs";

export function createPathfinder(grid) {
  const easystar = new EasyStar.js();
  easystar.setGrid(grid);
  easystar.setAcceptableTiles([0]);
  easystar.enableDiagonals();
  easystar.disableCornerCutting();
  easystar.setIterationsPerCalculation(1000);

  function findPath(fromX, fromY, toX, toY) {
    return new Promise((resolve) => {
      easystar.findPath(fromX, fromY, toX, toY, (path) => {
        resolve(path || []);
      });
      easystar.calculate();
    });
  }

  return { findPath, easystar };
}

/** Build walkability grid from Phaser tilemap collision layer (0 = walkable). */
export function gridFromCollisionLayer(layer) {
  const rows = [];
  for (let y = 0; y < layer.height; y++) {
    const row = [];
    for (let x = 0; x < layer.width; x++) {
      const tile = layer.getTileAt(x, y);
      row.push(tile && tile.index > 0 ? 1 : 0);
    }
    rows.push(row);
  }
  return rows;
}
