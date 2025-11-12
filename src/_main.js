// base
var Vector = require('./Vector.js');
window.L.Vector = Vector;

var Cell = require('./Cell.js');
window.L.Cell = Cell;

var Field = require('./Field.js');
window.L.Field = Field;

var ScalarField = require('./ScalarField.js');
window.L.ScalarField = ScalarField;

var VectorField = require('./VectorField.js');
window.L.VectorField = VectorField;

// external
require('geotiff');

// layer
require('./layer/L.CanvasLayer.js');
require('./layer/L.CanvasLayer.SimpleLonLat.js');
require('./layer/L.CanvasLayer.Field.js');
require('./layer/L.CanvasLayer.ScalarField.js');
require('./layer/L.CanvasLayer.VectorFieldAnim.js');
require('./layer/L.CanvasLayer.VectorField.js');

// control
require('./control/L.Control.ColorBar.js');
