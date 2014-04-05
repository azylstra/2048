function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;
  this.difficulty     = 0;
  this.startTiles     = 2;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  if (this.over || (this.won && !this.keepPlaying)) {
    return true;
  } else {
    return false;
  }
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  var diff = parseFloat($("#difficulty .active").data("value"));
  console.log('diffulty = ' + diff);
  this.difficulty     = diff || 0;

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.99 ? 'p' : 'D';
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    if(this.grid.availableCells().length > 0)
      this.grid.insertTile(tile);
    else {
      console.log(this.grid.availableCells());
      console.log('over0');
      this.over = true;
    }
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && self.checkMergeable(tile,next) && !next.mergedFrom) {
          var doMerge = true;
          // special case for pp. Doesn't always merge!
          // pp fusion is rare!
          if(next.value === 'p' && tile.value === 'p') {
            var ran = Math.random();
            doMerge = ran < (1.0 - self.difficulty) ? true : false;
          }

          if(doMerge) {
            var mergedVal = self.getMergeVal(tile, next);
            var merged = new Tile(positions.next, mergedVal);
            merged.mergedFrom = [tile, next];

            self.grid.insertTile(merged);
            self.grid.removeTile(tile);

            // Converge the two tiles' positions
            tile.updatePosition(positions.next);

            // Update the score
            self.score += self.getMergeScore(merged);

            // Check to see if secondaries need to be generated
            if( self.secondaries(tile,next) ) {
              self.getSecondaries(tile,next).forEach(function(secTile) {
                if(self.grid.availableCells().length > 0) {
                  tile2 = new Tile(self.grid.randomAvailableCell(), secTile);
                  self.grid.insertTile(tile2);
                  self.actuate();
                }
                else {
                  console.log('over1');
                  self.over = true;
                }
              });
            }

            // The mighty Fe tile
            if (merged.value === '56Fe') 
              self.won = true;
          }
          else {
            if(!self.movesAvailable()) {
              console.log('over2');
              self.over = true; // game over
            }
            else {
              self.moveTile(tile, positions.farthest);
              moved = true;
            }
            self.actuate();
          }
        } else {
          self.moveTile(tile, positions.farthest);
          moved = true;
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && self.checkMergeable(tile,other)) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};

// Define available reactions:
var merges = 
      {'p': ['p'], 
      'D': ['p'],
      '3He': ['3He'],
      '4He': ['4He'],
      '8Be': ['4He'],
      '12C': ['p','4He','12C'],
      '13C': ['p'],
      '14N': ['p'],
      '15N': ['p'],
      '16O': ['4He','16O'],
      '20Ne': ['4He'],
      '24Mg': ['4He'],
      '28Si': ['4He'],
      '32S': ['4He'],
      '36Ar': ['4He'],
      '40Ca': ['4He'],
      '44Ti': ['4He'],
      '48Cr': ['4He'],
      '52Fe': ['4He']};

var mergeValues = 
    {'pp': 'D',
    'pD': '3He',
    '3He3He': '4He',
    '4He4He': '8Be',
    '4He8Be': '12C',
    'p12C': '13C',
    'p13C': '14N',
    'p14N': '15N',
    'p15N': '12C',
    '4He12C': '16O',
    '12C12C': '20Ne',
    '4He16O': '20Ne',
    '16O16O': '28Si',
    '4He20Ne': '24Mg',
    '4He24Mg': '28Si',
    '4He28Si': '32S',
    '4He32S': '36Ar',
    '4He36Ar': '40Ca',
    '4He40Ca': '44Ti',
    '4He44Ti': '48Cr',
    '4He48Cr': '52Fe',
    '4He52Fe': '56Fe'};

var mergeSecondaries = 
    {'pp': false,
    'pD': false,
    '3He3He': true,
    '4He4He': false,
    '4He8Be': false,
    'p12C': false,
    'p13C': false,
    'p14N': false,
    'p15N': true,
    '4He12C': false,
    '12C12C': true,
    '4He16O': false,
    '16O16O': true,
    '4He20Ne': false,
    '4He24Mg': false,
    '4He28Si': false,
    '4He32S': false,
    '4He36Ar': false,
    '4He40Ca': false,
    '4He44Ti': false,
    '4He48Cr': false,
    '4He52Fe': false};

var mergeSecondaryValues = 
    {'3He3He': ['p','p'],
    'p15N': ['4He'],
    '12C12C': ['4He'],
    '16O16O': ['4He']};

GameManager.prototype.checkMergeable = function(first, second) {
  ret = false;
  try {
  merges[first.value].forEach(function(value) {
    if(value === second.value)
      ret = true;
  });} catch(err){};
  try {
  merges[second.value].forEach(function(value) {
    if( value === first.value)
      ret = true;
  });} catch(err){};
  // if(merges[first.value] === second.value || merges[second.value] === first.value)
  //   return true;
  return ret;
};

GameManager.prototype.getMergeVal = function(first, second) {
  if( mergeValues.hasOwnProperty(first.value+second.value) )
    return mergeValues[ first.value+second.value ];
  return mergeValues[ second.value+first.value ];
}

// check if secondary products of a reaction should be generated
GameManager.prototype.secondaries = function(first, second) {
  return (mergeSecondaries[ first.value+second.value ] || mergeSecondaries[ second.value+first.value ]);
}

// get secondary values generated by a reaction
GameManager.prototype.getSecondaries = function(first, second) {
  if( mergeSecondaryValues.hasOwnProperty(first.value+second.value) )
    return mergeSecondaryValues[ first.value+second.value ];
  return mergeSecondaryValues[ second.value+first.value ];
}

// Scoring is done based on atomic A
GameManager.prototype.getMergeScore = function(tile) {
  if(tile.value === 'D')
    return 2;
  return parseInt(tile.value.split(/(?:[a-zA-Z])/,1)[0]);
}