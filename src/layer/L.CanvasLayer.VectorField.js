/**
 * VectorField on canvas
 */
var Cell = require('../Cell');
var chroma = require('chroma-js');

L.CanvasLayer.VectorField = L.CanvasLayer.Field.extend({
    options: {
        type: 'arrows', // [colormap | arrows | scaledArrows]
        color: 'white', // function colorFor(value) [e.g. chromajs.scale],
        interpolate: false, // Change to use interpolation
        vectorSize: 20, // only used if 'vector'
        arrowDirection: 'from' // [from|towards]
    },

    initialize: function(vectorField, options) {
        L.CanvasLayer.Field.prototype.initialize.call(
            this,
            vectorField,
            options
        );
        L.Util.setOptions(this, options);
    },

    _showCanvas() {
        L.CanvasLayer.Field.prototype._showCanvas.call(this);
        this.needRedraw(); // TODO check spurious redraw (e.g. hide/show without moving map)
    },

    /* eslint-disable no-unused-vars */
    onDrawLayer: function(viewInfo) {
        if (!this.isVisible()) return;
        this._updateOpacity();

        let r = this._getRendererMethod();
        console.time('onDrawLayer');
        r();
        console.timeEnd('onDrawLayer');

    },
    /* eslint-enable no-unused-vars */

    _getRendererMethod: function() {
        switch (this.options.type) {
            case 'arrows':
                return this._drawArrows.bind(this);
            case 'scaledArrows':
                return this._drawScaledArrows.bind(this);
            default:
                throw Error(`Unknown renderer type: ${this.options.type}`);
        }
    },

    /**
     * Draws the field as a set of arrows. Direction from 0 to 360 is assumed.
     */
    _drawArrows: function() {
        // magnitude hard-coded to 5
        const bounds = this._pixelBounds();
        const pixelSize = (bounds.max.x - bounds.min.x) / this._field.nCols;
        var stride = Math.max(1, Math.floor(1.2 * this.options.vectorSize / pixelSize));
        const ctx = this._getDrawingContext();
        ctx.strokeStyle = this.options.color;
        var currentBounds = this._map.getBounds();
        for (var y = 0; y < this._field.height; y = y + stride) {
            for (var x = 0; x < this._field.width; x = x + stride) {
                let [lon, lat] = this._field._lonLatAtIndexes(x, y);
                let center = L.latLng(lat, lon);
                if (currentBounds.contains(center)) {
                    let v = this._field.valueAt(lon, lat);
                    if (v !== null) {
                        let verticalAngle = Math.atan2(v.u, v.v);
                        // directionTo
                        let inDegrees = verticalAngle * (180.0 / Math.PI);
                        if (inDegrees < 0) {
                            inDegrees = inDegrees + 360.0;
                        }
                        // directionFrom
                        let opposite = (inDegrees + 180.0) % 360.0;
                        let direction = opposite;
                        this._drawArrow(center, direction, 5, ctx);
                    }
                }
            }
        }
    },

    _drawScaledArrows: function() {
        const bounds = this._pixelBounds();
        const pixelSize = (bounds.max.x - bounds.min.x) / this._field.nCols;
        var stride = Math.max(1, Math.floor(1.2 * this.options.vectorSize / pixelSize));
        const ctx = this._getDrawingContext();
        ctx.strokeStyle = this.options.color;
        var currentBounds = this._map.getBounds();
        for (var y = 0; y < this._field.height; y = y + stride) {
            for (var x = 0; x < this._field.width; x = x + stride) {
                let [lon, lat] = this._field._lonLatAtIndexes(x, y);
                let center = L.latLng(lat, lon);
                if (currentBounds.contains(center)) {
                    let v = this._field.valueAt(lon, lat);
                    if (v !== null) {
                        let magnitude = Math.sqrt(Math.pow(v.u, 2) + Math.pow(v.v, 2));
                        let verticalAngle = Math.atan2(v.u, v.v);
                        // directionTo
                        let inDegrees = verticalAngle * (180.0 / Math.PI);
                        if (inDegrees < 0) {
                            inDegrees = inDegrees + 360.0;
                        }
                        // directionFrom
                        let opposite = (inDegrees + 180.0) % 360.0;
                        let direction = opposite;
                        this._drawArrow(center, direction, magnitude, ctx);
                    }
                }
            }
        }
    },

    _drawArrow: function(center, direction, magnitude, ctx) {
        var projected = this._map.latLngToContainerPoint(center);

        // colormap vs. simple color
        let color = this.options.color;
        if (typeof color === 'function') {
            ctx.strokeStyle = color(direction);
        }
        if (this.options.type === 'arrows') {
            magnitude = 5;
        }
        const size = this.options.vectorSize * magnitude / 5;
        ctx.save();

        ctx.translate(projected.x, projected.y);

        let rotationRads = (90 + direction) * Math.PI / 180; // from, by default
        if (this.options.arrowDirection === 'towards') {
            rotationRads = rotationRads + Math.PI;
        }
        ctx.rotate(rotationRads);

        ctx.beginPath();
        ctx.moveTo(-size / 2, 0);
        ctx.lineTo(+size / 2, 0);
        ctx.moveTo(size * 0.25, -size * 0.25);
        ctx.lineTo(+size / 2, 0);
        ctx.lineTo(size * 0.25, size * 0.25);
        ctx.stroke();
        ctx.restore();
    },

    _pixelBounds: function() {
        const bounds = this.getBounds();
        const northWest = this._map.latLngToContainerPoint(
            bounds.getNorthWest()
        );
        const southEast = this._map.latLngToContainerPoint(
            bounds.getSouthEast()
        );
        var pixelBounds = L.bounds(northWest, southEast);
        return pixelBounds;
    },
});

L.canvasLayer.vectorField = function(vectorField, options) {
    return new L.CanvasLayer.VectorField(vectorField, options);
};
