class Vector {

    constructor(u, v) {
        this.u = u;
        this.v = v;
    }

    /**
     * Magnitude
     * @returns {Number}
     */
    magnitude() {
        return Math.sqrt(this.u * this.u + this.v * this.v);
    }

    /**
     * Angle in degrees (0 to 360º) --> Towards
     * N is 0º and E is 90º
     * @returns {Number}
     */
    directionTo() {
        let verticalAngle = Math.atan2(this.u, this.v);
        let inDegrees = verticalAngle * (180.0 / Math.PI);
        if (inDegrees < 0) {
            inDegrees = inDegrees + 360.0;
        }
        return inDegrees;
    }

    /**
     * Angle in degrees (0 to 360º) From x-->
     * N is 0º and E is 90º
     * @returns {Number}
     */
    directionFrom() {
        let a = this.directionTo();
        let opposite = (a + 180.0) % 360.0;
        return opposite;
    }

    /*
        Degrees --> text
        new Dictionary<int, string>
        {
            //{0, 23, 45, 68, 90, 113, 135, 158, 180, 203, 225, 248, 270, 293, 315, 338, 360};
            {0, 'N'},
            {23, 'NNE'},
            {45, 'NE'},
            {68, 'ENE'},
            {90, 'E'},
            {113, 'ESE'},
            {135, 'SE'},
            {158, 'SSE'},
            {180, 'S'},
            {203, 'SSW'},
            {225, 'SW'},
            {248, 'WSW'},
            {270, 'W'},
            {293, 'WNW'},
            {315, 'NW'},
            {338, 'NNW'},
            {360, 'N'}
        };
    */
}

class Cell {

    /**
     * A simple cell with a numerical value
     * @param {L.LatLng} center
     * @param {Number|Vector} value
     * @param {Number} xSize
     * @param {Number} ySize
     */
    constructor(center, value, xSize, ySize = xSize) {
        this.center = center;
        this.value = value;
        this.xSize = xSize;
        this.ySize = ySize;
    }

    equals(anotherCell) {
        return (
            this.center.equals(anotherCell.center) &&
            this._equalValues(this.value, anotherCell.value) &&
            this.xSize === anotherCell.xSize &&
            this.ySize === anotherCell.ySize
        );
    }

    _equalValues(value, anotherValue) {
        let type = value.constructor.name;
        let answerFor = {
            Number: value === anotherValue,
            Vector: value.u === anotherValue.u && value.v === anotherValue.v
        };
        return answerFor[type];
    }

    /**
     * Bounds for the cell
     * @returns {LatLngBounds}
     */
    getBounds() {
        let halfX = this.xSize / 2.0;
        let halfY = this.ySize / 2.0;
        let cLat = this.center.lat;
        let cLng = this.center.lng;
        let ul = L.latLng([cLat + halfY, cLng - halfX]);
        let lr = L.latLng([cLat - halfY, cLng + halfX]);

        return L.latLngBounds(
            L.latLng(lr.lat, ul.lng),
            L.latLng(ul.lat, lr.lng)
        );
    }
}


class Field {

    constructor(params) {
        this.params = params;

        this.nCols = params['nCols'];
        this.nRows = params['nRows'];

        // alias
        this.width = params['nCols'];
        this.height = params['nRows'];

        // ll = lower-left
        this.xllCorner = params['xllCorner'];
        this.yllCorner = params['yllCorner'];

        // ur = upper-right
        this.xurCorner =
            params['xllCorner'] + params['nCols'] * params['cellXSize'];
        this.yurCorner =
            params['yllCorner'] + params['nRows'] * params['cellYSize'];

        this.cellXSize = params['cellXSize'];
        this.cellYSize = params['cellYSize'];

        this.grid = null; // to be defined by subclasses
        this.isContinuous = this.xurCorner - this.xllCorner >= 360;
        this.longitudeNeedsToBeWrapped = this.xurCorner > 180; // [0, 360] --> [-180, 180]

        this._inFilter = null;
        this._spatialMask = null;
    }

    /**
     * Builds a grid with a value at each point (either Vector or Number)
     * Original params must include the required input values, following
     * x-ascending & y-descending order (same as in ASCIIGrid)
     * @abstract
     * @private
     * @returns {Array.<Array.<Vector|Number>>} - grid[row][column]--> Vector|Number
     */
    _buildGrid() {
        throw new TypeError('Must be overriden');
    }

    _updateRange() {
        this.range = this._calculateRange();
    }

    /**
     * Number of cells in the grid (rows * cols)
     * @returns {Number}
     */
    numCells() {
        return this.nRows * this.nCols;
    }

    /**
     * A list with every cell
     * @returns {Array<Cell>} - cells (x-ascending & y-descending order)
     */
    getCells(stride = 1) {
        let cells = [];
        for (let j = 0; j < this.nRows; j = j + stride) {
            for (let i = 0; i < this.nCols; i = i + stride) {
                let [lon, lat] = this._lonLatAtIndexes(i, j);
                let center = L.latLng(lat, lon);
                let value = this._valueAtIndexes(i, j);
                let c = new Cell(center, value, this.cellXSize, this.cellYSize);
                cells.push(c); // <<
            }
        }
        return cells;
    }

    /**
     * Apply a filter function to field values
     * @param   {Function} f - boolean function
     */
    setFilter(f) {
        this._inFilter = f;
        this._updateRange();
    }

    /**
     * Apply a spatial mask to field values
     * @param {L.GeoJSON} m 
     */
    setSpatialMask(m) {
        this._spatialMask = m;
    }

    /**
     * Grid extent
     * @returns {Number[]} [xmin, ymin, xmax, ymax]
     */
    extent() {
        let [xmin, xmax] = this._getWrappedLongitudes();
        return [xmin, this.yllCorner, xmax, this.yurCorner];
    }

    /**
     * [xmin, xmax] in [-180, 180] range
     */
    _getWrappedLongitudes() {
        let xmin = this.xllCorner;
        let xmax = this.xurCorner;

        if (this.longitudeNeedsToBeWrapped) {
            if (this.isContinuous) {
                xmin = -180;
                xmax = 180;
            } else {
                // not sure about this (just one particular case, but others...?)
                xmax = this.xurCorner - 360;
                xmin = this.xllCorner - 360;
                /* eslint-disable no-console */
                // console.warn(`are these xmin: ${xmin} & xmax: ${xmax} OK?`);
                // TODO: Better throw an exception on no-controlled situations.
                /* eslint-enable no-console */
            }
        }
        return [xmin, xmax];
    }

    /**
     * Returns whether or not the grid contains the point, considering
     * the spatialMask if it has been previously set
     * @param   {Number} lon - longitude
     * @param   {Number} lat - latitude
     * @returns {Boolean}
     */
    contains(lon, lat) {
        if (this._spatialMask) {
            return this._pointInMask(lon, lat);
        }
        return this._pointInExtent(lon, lat);
    }

    /**
     * Checks if coordinates are inside the Extent (considering wrapped longitudes if needed)
     * @param {Number} lon 
     * @param {Number} lat 
     */
    _pointInExtent(lon, lat) {
        let [xmin, xmax] = this._getWrappedLongitudes();
        let longitudeIn = lon >= xmin && lon <= xmax;
        let latitudeIn = lat >= this.yllCorner && lat <= this.yurCorner;
        return longitudeIn && latitudeIn;
    }

    /**
     * Check if coordinates are inside the spatialMask (Point in Polygon analysis)
     * @param {Number} lon 
     * @param {Number} lat 
     */
    _pointInMask(lon, lat) {
        const pt = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat] // geojson, lon-lat order !
            },
            properties: {}
        };
        const poly = this._spatialMask;
        return inside(pt, poly);
    }

    /**
     * Returns if the grid doesn't contain the point
     * @param   {Number} lon - longitude
     * @param   {Number} lat - latitude
     * @returns {Boolean}
     */
    notContains(lon, lat) {
        return !this.contains(lon, lat);
    }

    /**
     * Interpolated value at lon-lat coordinates (bilinear method)
     * @param   {Number} longitude
     * @param   {Number} latitude
     * @returns {Vector|Number} [u, v, magnitude]
     *                          
     * Source: https://github.com/cambecc/earth > product.js
     */
    interpolatedValueAt(lon, lat) {
        if (this.notContains(lon, lat)) return null;

        let [i, j] = this._getDecimalIndexes(lon, lat);
        return this.interpolatedValueAtIndexes(i, j);
    }

    /**
     * Interpolated value at i-j indexes (bilinear method)
     * @param   {Number} i
     * @param   {Number} j
     * @returns {Vector|Number} [u, v, magnitude]
     *
     * Source: https://github.com/cambecc/earth > product.js
     */
    interpolatedValueAtIndexes(i, j) {
        //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
        //        fi  i   ci          four points 'G' that enclose point (i, j). These points are at the four
        //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
        //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
        //    j ___|_ .   |           (1, 9) and (2, 9).
        //  =8.3   |      |
        //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
        //         |      |           column, so the index ci can be used without taking a modulo.

        let indexes = this._getFourSurroundingIndexes(i, j);
        let [fi, ci, fj, cj] = indexes;
        let values = this._getFourSurroundingValues(fi, ci, fj, cj);
        if (values) {
            let [g00, g10, g01, g11] = values;
            return this._doInterpolation(i - fi, j - fj, g00, g10, g01, g11);
        }
        return null;
    }

    /**
     * Get decimal indexes
     * @private
     * @param {Number} lon
     * @param {Number} lat
     * @returns {Array}    [[Description]]
     */
    _getDecimalIndexes(lon, lat) {
        if (this.longitudeNeedsToBeWrapped && lon < this.xllCorner) {
            lon = lon + 360;
        }
        let i = (lon - this.xllCorner) / this.cellXSize;
        let j = (this.yurCorner - lat) / this.cellYSize;
        return [i, j];
    }

    /**
     * Get surrounding indexes (integer), clampling on borders
     * @private
     * @param   {Number} i - decimal index
     * @param   {Number} j - decimal index
     * @returns {Array} [fi, ci, fj, cj]
     */
    _getFourSurroundingIndexes(i, j) {
        let fi = Math.floor(i);
        let ci = fi + 1;
        // duplicate colum to simplify interpolation logic (wrapped value)
        if (this.isContinuous && ci >= this.nCols) {
            ci = 0;
        }
        ci = this._clampColumnIndex(ci);

        let fj = this._clampRowIndex(Math.floor(j));
        let cj = this._clampRowIndex(fj + 1);

        return [fi, ci, fj, cj];
    }

    /**
     * Get four surrounding values or null if not available,
     * from 4 integer indexes
     * @private
     * @param   {Number} fi
     * @param   {Number} ci
     * @param   {Number} fj
     * @param   {Number} cj
     * @returns {Array} 
     */
    _getFourSurroundingValues(fi, ci, fj, cj) {
        var row;
        if ((row = this.grid[fj])) {
            // upper row ^^
            var g00 = row[fi]; // << left
            var g10 = row[ci]; // right >>
            if (
                this._isValid(g00) &&
                this._isValid(g10) &&
                (row = this.grid[cj])
            ) {
                // lower row vv
                var g01 = row[fi]; // << left
                var g11 = row[ci]; // right >>
                if (this._isValid(g01) && this._isValid(g11)) {
                    return [g00, g10, g01, g11]; // 4 values found!
                }
            }
        }
        return null;
    }

    /**
     * Nearest value at lon-lat coordinates
     * @param   {Number} longitude
     * @param   {Number} latitude
     * @returns {Vector|Number}
     */
    valueAt(lon, lat) {
        if (this.notContains(lon, lat)) return null;

        let [i, j] = this._getDecimalIndexes(lon, lat);
        let ii = Math.floor(i);
        let jj = Math.floor(j);

        const ci = this._clampColumnIndex(ii);
        const cj = this._clampRowIndex(jj);

        let value = this._valueAtIndexes(ci, cj);
        if (this._inFilter) {
            if (!this._inFilter(value)) return null;
        }

        return value;
    }

    /**
     * Returns whether or not the field has a value at the point
     * @param   {Number} lon - longitude
     * @param   {Number} lat - latitude
     * @returns {Boolean}
     */
    hasValueAt(lon, lat) {
        let value = this.valueAt(lon, lat);
        let hasValue = value !== null;

        let included = true;
        if (this._inFilter) {
            included = this._inFilter(value);
        }
        return hasValue && included;
    }

    /**
     * Returns if the grid has no value at the point
     * @param   {Number} lon - longitude
     * @param   {Number} lat - latitude
     * @returns {Boolean}
     */
    notHasValueAt(lon, lat) {
        return !this.hasValueAt(lon, lat);
    }

    /**
     * Gives a random position to 'o' inside the grid
     * @param {Object} [o] - an object (eg. a particle)
     * @returns {{x: Number, y: Number}} - object with x, y (lon, lat)
     */
    randomPosition(o = {}) {
        let i = (Math.random() * this.nCols) | 0;
        let j = (Math.random() * this.nRows) | 0;

        o.x = this._longitudeAtX(i);
        o.y = this._latitudeAtY(j);

        return o;
    }

    /**
     * Value for grid indexes
     * @param   {Number} i - column index (integer)
     * @param   {Number} j - row index (integer)
     * @returns {Vector|Number}
     */
    _valueAtIndexes(i, j) {
        return this.grid[j][i]; // <-- j,i !!
    }

    /**
     * Lon-Lat for grid indexes
     * @param   {Number} i - column index (integer)
     * @param   {Number} j - row index (integer)
     * @returns {Number[]} [lon, lat]
     */
    _lonLatAtIndexes(i, j) {
        let lon = this._longitudeAtX(i);
        let lat = this._latitudeAtY(j);

        return [lon, lat];
    }

    /**
     * Longitude for grid-index
     * @param   {Number} i - column index (integer)
     * @returns {Number} longitude at the center of the cell
     */
    _longitudeAtX(i) {
        let halfXPixel = this.cellXSize / 2.0;
        let lon = this.xllCorner + halfXPixel + i * this.cellXSize;
        if (this.longitudeNeedsToBeWrapped) {
            lon = lon > 180 ? lon - 360 : lon;
        }
        return lon;
    }

    /**
     * Latitude for grid-index
     * @param   {Number} j - row index (integer)
     * @returns {Number} latitude at the center of the cell
     */
    _latitudeAtY(j) {
        let halfYPixel = this.cellYSize / 2.0;
        return this.yurCorner - halfYPixel - j * this.cellYSize;
    }

    /**
     * Apply the interpolation
     * @abstract
     * @private
     */
    /* eslint-disable no-unused-vars */
    _doInterpolation(x, y, g00, g10, g01, g11) {
        throw new TypeError('Must be overriden');
    }
    /* eslint-disable no-unused-vars */

    /**
     * Check the column index is inside the field,
     * adjusting to min or max when needed
     * @private
     * @param   {Number} ii - index
     * @returns {Number} i - inside the allowed indexes
     */
    _clampColumnIndex(ii) {
        let i = ii;
        if (ii < 0) {
            i = 0;
        }
        let maxCol = this.nCols - 1;
        if (ii > maxCol) {
            i = maxCol;
        }
        return i;
    }

    /**
     * Check the row index is inside the field,
     * adjusting to min or max when needed
     * @private
     * @param   {Number} jj index
     * @returns {Number} j - inside the allowed indexes
     */
    _clampRowIndex(jj) {
        let j = jj;
        if (jj < 0) {
            j = 0;
        }
        let maxRow = this.nRows - 1;
        if (jj > maxRow) {
            j = maxRow;
        }
        return j;
    }

    /**
     * Is valid (not 'null' nor 'undefined')
     * @private
     * @param   {Object} x object
     * @returns {Boolean}
     */
    _isValid(x) {
        return x !== null && x !== undefined;
    }
}

class ScalarField extends Field {

    /**
     * Creates a ScalarField from the content of an ASCIIGrid file
     * @param   {String}   asc
     * @returns {ScalarField}
     */
    static fromASCIIGrid(asc, scaleFactor = 1) {
        //console.time('ScalarField from ASC');

        let lines = asc.split('\n');

        // Header
        var header = ScalarField._parseASCIIGridHeader(lines.slice(0, 6));

        // Data (left-right and top-down)
        let zs = [];
        for (let i = 6; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line === '') break;

            let items = line.split(' ');
            items.forEach(it => {
                let floatItem = parseFloat(it);
                let v =
                    floatItem !== header.noDataValue
                        ? floatItem * scaleFactor
                        : null;
                zs.push(v);
            });
        }
        let p = header;
        p.zs = zs;

        //console.timeEnd('ScalarField from ASC');
        return new ScalarField(p);
    }

    /**
     * Parse an ASCII Grid header, made with 6 lines
     * It allows the use of XLLCORNER/YLLCORNER or XLLCENTER/YLLCENTER conventions
     * @param {Array.String} headerLines
     */
    static _parseASCIIGridHeader(headerLines) {
        try {
            const headerItems = headerLines.map(line => {
                var items = line.split(' ').filter(i => i != '');
                var param = items[0].trim().toUpperCase();
                var value = parseFloat(items[1].trim());
                return { [param]: value };
            });

            const usesCorner = 'XLLCORNER' in headerItems[2];
            const cellSize = headerItems[4]['CELLSIZE'];

            const header = {
                nCols: parseInt(headerItems[0]['NCOLS']),
                nRows: parseInt(headerItems[1]['NROWS']),
                xllCorner: usesCorner
                    ? headerItems[2]['XLLCORNER']
                    : headerItems[2]['XLLCENTER'] - cellSize,
                yllCorner: usesCorner
                    ? headerItems[3]['YLLCORNER']
                    : headerItems[3]['YLLCENTER'] - cellSize,
                cellXSize: cellSize,
                cellYSize: cellSize,
                noDataValue: headerItems[5]['NODATA_VALUE']
            };
            return header;
        } catch (err) {
            throw new Error(`Not a valid ASCIIGrid Header: ${err}`);
        }
    }

    /**
     * Creates a ScalarField from the content of a GeoTIFF file
     * @param   {ArrayBuffer}   data
     * @param   {Number}   bandIndex
     * @returns {ScalarField}
     */
    static fromGeoTIFF(data, bandIndex = 0) {
        return ScalarField.multipleFromGeoTIFF(data, [bandIndex])[0];
    }

    /**
     * Creates a ScalarField array (one per band) from the content of a GeoTIFF file
     * @param   {ArrayBuffer}   data
     * @param   {Array}   bandIndexes - if not provided all bands are returned
     * @returns {Array.<ScalarField>}
     */
    static multipleFromGeoTIFF(data, bandIndexes) {
        //console.time('ScalarField from GeoTIFF');

        let tiff = GeoTIFF.parse(data); // geotiff.js
        let image = tiff.getImage();
        let rasters = image.readRasters();
        let tiepoint = image.getTiePoints()[0];
        let fileDirectory = image.getFileDirectory();
        let [xScale, yScale] = fileDirectory.ModelPixelScale;

        if (typeof bandIndexes === 'undefined' || bandIndexes.length === 0) {
            bandIndexes = [...Array(rasters.length).keys()];
        }

        let scalarFields = [];
        scalarFields = bandIndexes.map(function(bandIndex) {
            let zs = rasters[bandIndex]; // left-right and top-down order

            if (fileDirectory.GDAL_NODATA) {
                let noData = parseFloat(fileDirectory.GDAL_NODATA);
                // console.log(noData);
                let simpleZS = Array.from(zs); // to simple array, so null is allowed | TODO efficiency??
                zs = simpleZS.map(function(z) {
                    return z === noData ? null : z;
                });
            }

            let p = {
                nCols: image.getWidth(),
                nRows: image.getHeight(),
                xllCorner: tiepoint.x,
                yllCorner: tiepoint.y - image.getHeight() * yScale,
                cellXSize: xScale,
                cellYSize: yScale,
                zs: zs
            };
            return new ScalarField(p);
        });

        //console.timeEnd('ScalarField from GeoTIFF');
        return scalarFields;
    }

    constructor(params) {
        super(params);
        this.zs = params['zs'];

        this.grid = this._buildGrid();
        this._updateRange();
        //console.log(`ScalarField created (${this.nCols} x ${this.nRows})`);
    }

    /**
     * Builds a grid with a Number at each point, from an array
     * 'zs' following x-ascending & y-descending order
     * (same as in ASCIIGrid)
     * @private
     * @returns {Array.<Array.<Number>>} - grid[row][column]--> Number
     */
    _buildGrid() {
        let grid = this._arrayTo2d(this.zs, this.nRows, this.nCols);
        return grid;
    }

    _arrayTo2d(array, nRows, nCols) {
        let grid = [];
        let p = 0;
        for (var j = 0; j < nRows; j++) {
            var row = [];
            for (var i = 0; i < nCols; i++, p++) {
                let z = array[p];
                row[i] = this._isValid(z) ? z : null; // <<<
            }
            grid[j] = row;
        }
        return grid;
    }

    _newDataArrays(params) {
        params['zs'] = [];
    }

    _pushValueToArrays(params, value) {
        params['zs'].push(value);
    }

    _makeNewFrom(params) {
        return new ScalarField(params);
    }

    /**
     * Calculate min & max values
     * @private
     * @returns {Array} - [min, max]
     */
    _calculateRange() {
        var data = this.zs;
        if (this._inFilter) {
            data = data.filter(this._inFilter);
        }
        return [d3.min(data), d3.max(data)];
    }

    /**
     * Bilinear interpolation for Number
     * https://en.wikipedia.org/wiki/Bilinear_interpolation
     * @param   {Number} x
     * @param   {Number} y
     * @param   {Number} g00
     * @param   {Number} g10
     * @param   {Number} g01
     * @param   {Number} g11
     * @returns {Number}
     */
    _doInterpolation(x, y, g00, g10, g01, g11) {
        var rx = 1 - x;
        var ry = 1 - y;
        return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
    }
}

class VectorField extends Field {

    /**
     * Creates a VectorField from the content of two ASCIIGrid files
     * @param   {String} ascU - with u-component
     * @param   {String} ascV - with v-component
     * @returns {VectorField}
     */
    static fromASCIIGrids(ascU, ascV, scaleFactor = 1) {
        let u = ScalarField.fromASCIIGrid(ascU, scaleFactor);
        let v = ScalarField.fromASCIIGrid(ascV, scaleFactor);
        let p = VectorField._paramsFromScalarFields(u, v);

        return new VectorField(p);
    }

    /**
     * Creates a VectorField from the content of two different Geotiff files
     * @param   {ArrayBuffer} gtU - geotiff data with u-component (band 0)
     * @param   {ArrayBuffer} gtV - geotiff data with v-component (band 0)
     * @returns {VectorField}
     */
    static fromGeoTIFFs(gtU, gtV) {
        let u = ScalarField.fromGeoTIFF(gtU);
        let v = ScalarField.fromGeoTIFF(gtV);
        let p = VectorField._paramsFromScalarFields(u, v);

        return new VectorField(p);
    }

    /**
     * Creates a VectorField from the content of Multiband Geotiff
     * @param   {ArrayBuffer} geotiffData - multiband
     * @param   {Array} bandIndexesForUV
     * @returns {VectorField}
     */
    static fromMultibandGeoTIFF(geotiffData, bandIndexesForUV = [0, 1]) {
        let [u, v] = ScalarField.multipleFromGeoTIFF(
            geotiffData,
            bandIndexesForUV
        );
        let p = VectorField._paramsFromScalarFields(u, v);

        return new VectorField(p);
    }

    /**
     * Build parameters for VectorField, from 2 ScalarFields.
     * No validation at all (nor interpolation) is applied, so u and v
     * must be 'compatible' from the source
     * @param   {ScalarField} u
     * @param   {ScalarField} v
     * @returns {Object} - parameters to build VectorField
     */
    static _paramsFromScalarFields(u, v) {
        // TODO check u & v compatibility (cellSize...)
        let p = {
            nCols: u.nCols,
            nRows: u.nRows,
            xllCorner: u.xllCorner,
            yllCorner: u.yllCorner,
            cellXSize: u.cellXSize,
            cellYSize: u.cellYSize,
            us: u.zs,
            vs: v.zs
        };
        return p;
    }

    constructor(params) {
        super(params);

        this.us = params['us'];
        this.vs = params['vs'];
        this.grid = this._buildGrid();
        this.range = this._calculateRange();
    }

    /**
     * Get a derived field, from a computation on
     * the VectorField
     * @param   {String} type ['magnitude' | 'directionTo' | 'directionFrom']
     * @returns {ScalarField}
     */
    getScalarField(type) {
        let f = this._getFunctionFor(type);
        let p = {
            nCols: this.params.nCols,
            nRows: this.params.nRows,
            xllCorner: this.params.xllCorner,
            yllCorner: this.params.yllCorner,
            cellXSize: this.params.cellXSize,
            cellYSize: this.params.cellYSize,
            zs: this._applyOnField(f)
        };
        return new ScalarField(p);
    }

    _getFunctionFor(type) {
        return function(u, v) {
            let uv = new Vector(u, v);
            return uv[type](); // magnitude, directionTo, directionFrom
        };
    }

    _applyOnField(func) {
        let zs = [];
        let n = this.numCells();
        for (var i = 0; i < n; i++) {
            let u = this.us[i];
            let v = this.vs[i];
            if (this._isValid(u) && this._isValid(v)) {
                zs.push(func(u, v));
            } else {
                zs.push(null);
            }
        }
        return zs;
    }

    /**
     * Builds a grid with a Vector at each point, from two arrays
     * 'us' and 'vs' following x-ascending & y-descending order
     * (same as in ASCIIGrid)
     * @returns {Array.<Array.<Vector>>} - grid[row][column]--> Vector
     */
    _buildGrid() {
        let grid = this._arraysTo2d(this.us, this.vs, this.nRows, this.nCols);
        return grid;
    }

    _arraysTo2d(us, vs, nRows, nCols) {
        let grid = [];
        let p = 0;

        for (var j = 0; j < nRows; j++) {
            var row = [];
            for (var i = 0; i < nCols; i++, p++) {
                let u = us[p],
                    v = vs[p];
                let valid = this._isValid(u) && this._isValid(v);
                row[i] = valid ? new Vector(u, v) : null; // <<<
            }
            grid[j] = row;
        }
        return grid;
    }

    _newDataArrays(params) {
        params['us'] = [];
        params['vs'] = [];
    }
    _pushValueToArrays(params, value) {
        //console.log(value);
        params['us'].push(value.u);
        params['vs'].push(value.v);
    }
    _makeNewFrom(params) {
        return new VectorField(params);
    }

    /**
     * Calculate min & max values (magnitude)
     * @private
     * @returns {Array}
     */
    _calculateRange() {
        // TODO make a clearer method for getting these vectors...
        let vectors = this.getCells()
            .map(pt => pt.value)
            .filter(function(v) {
                return v !== null;
            });

        if (this._inFilter) {
            vectors = vectors.filter(this._inFilter);
        }

        // TODO check memory crash with high num of vectors!
        let magnitudes = vectors.map(v => v.magnitude());
        let min = d3.min(magnitudes);
        let max = d3.max(magnitudes);

        return [min, max];
    }

    /**
     * Bilinear interpolation for Vector
     * https://en.wikipedia.org/wiki/Bilinear_interpolation
     * @param   {Number} x
     * @param   {Number} y
     * @param   {Number[]} g00
     * @param   {Number[]} g10
     * @param   {Number[]} g01
     * @param   {Number[]} g11
     * @returns {Vector}
     */
    _doInterpolation(x, y, g00, g10, g01, g11) {
        var rx = 1 - x;
        var ry = 1 - y;
        var a = rx * ry,
            b = x * ry,
            c = rx * y,
            d = x * y;
        var u = g00.u * a + g10.u * b + g01.u * c + g11.u * d;
        var v = g00.v * a + g10.v * b + g01.v * c + g11.v * d;
        return new Vector(u, v);
    }

    /**
     * Is valid (not 'null' nor 'undefined')
     * @private
     * @param   {Object} x object
     * @returns {Boolean}
     */
    _isValid(x) {
        return x !== null && x !== undefined;
    }
}

L.Vector = function() {
    return new Vector();
};

L.Cell = function() {
    return new Cell();
};

L.Field = function() {
    return new Field();
};

L.ScalarField = function() {
    return new ScalarField();
};

L.VectorField = function() {
    return new VectorField();
};


L.CanvasLayer = L.Layer.extend({
    // -- initialized is called on prototype
    initialize: function (options) {
        this._map = null;
        this._canvas = null;
        this._frame = null;
        this._delegate = null;
        L.setOptions(this, options);
    },

    delegate: function (del) {
        this._delegate = del;
        return this;
    },

    needRedraw: function () {
        if (!this._frame) {
            this._frame = L.Util.requestAnimFrame(this.drawLayer, this);
        }
        return this;
    },

    //-------------------------------------------------------------
    _onLayerDidResize: function (resizeEvent) {
        this._canvas.width = resizeEvent.newSize.x;
        this._canvas.height = resizeEvent.newSize.y;
    },
    //-------------------------------------------------------------
    _onLayerDidMove: function () {
        var topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
        this.drawLayer();
    },
    //-------------------------------------------------------------
    getEvents: function () {
        var events = {
            resize: this._onLayerDidResize,
            moveend: this._onLayerDidMove
        };
        if (this._map.options.zoomAnimation && L.Browser.any3d) {
            events.zoomanim = this._animateZoom;
        }

        return events;
    },
    //-------------------------------------------------------------
    onAdd: function (map) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'leaflet-layer');
        this.tiles = {};

        var size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;

        var animated = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));


        map._panes.overlayPane.appendChild(this._canvas);

        map.on(this.getEvents(), this);

        var del = this._delegate || this;
        del.onLayerDidMount && del.onLayerDidMount(); // -- callback

        this.needRedraw();
    },

    //-------------------------------------------------------------
    onRemove: function (map) {
        var del = this._delegate || this;
        del.onLayerWillUnmount && del.onLayerWillUnmount(); // -- callback


        map.getPanes().overlayPane.removeChild(this._canvas);

        map.off(this.getEvents(), this);

        this._canvas = null;

    },

    //------------------------------------------------------------
    addTo: function (map) {
        map.addLayer(this);
        return this;
    },
    // --------------------------------------------------------------------------------
    LatLonToMercator: function (latlon) {
        return {
            x: latlon.lng * 6378137 * Math.PI / 180,
            y: Math.log(Math.tan((90 + latlon.lat) * Math.PI / 360)) * 6378137
        };
    },

    //------------------------------------------------------------------------------
    drawLayer: function () {
        // -- todo make the viewInfo properties  flat objects.
        var size = this._map.getSize();
        var bounds = this._map.getBounds();
        var zoom = this._map.getZoom();

        var center = this.LatLonToMercator(this._map.getCenter());
        var corner = this.LatLonToMercator(this._map.containerPointToLatLng(this._map.getSize()));

        var del = this._delegate || this;
        del.onDrawLayer && del.onDrawLayer({
            layer: this,
            canvas: this._canvas,
            bounds: bounds,
            size: size,
            zoom: zoom,
            center: center,
            corner: corner
        });
        this._frame = null;
    },

    //------------------------------------------------------------------------------
    _animateZoom: function (e) {
        var scale = this._map.getZoomScale(e.zoom);
        var offset = this._map._latLngToNewLayerPoint(this._map.getBounds().getNorthWest(), e.zoom, e.center);

        L.DomUtil.setTransform(this._canvas, offset, scale);
    }
});

L.canvasLayer = function () {
    return new L.CanvasLayer();
};

L.CanvasLayer.SimpleLonLat = L.CanvasLayer.extend({
    options: {
        color: 'gray'
    },

    initialize: function(points, options) {
        this.points = points;
        L.Util.setOptions(this, options);
    },

    onLayerDidMount: function() {
        // -- prepare custom drawing
    },

    onLayerWillUnmount: function() {
        // -- custom cleanup
    },

    /* eslint-disable no-unused-vars */
    setData: function(data) {
        // -- custom data set
        this.needRedraw(); // -- call to drawLayer
    },
    /* eslint-enable no-unused-vars */

    onDrawLayer: function(viewInfo) {
        // canvas preparation
        let g = viewInfo.canvas.getContext('2d');
        g.clearRect(0, 0, viewInfo.canvas.width, viewInfo.canvas.height);
        g.fillStyle = this.options.color;

        for (let point of this.points) {
            let p = viewInfo.layer._map.latLngToContainerPoint(point);
            g.beginPath();
            //g.arc(p.x, p.y, 1, 0, Math.PI * 2); // circle | TODO style 'function' as parameter?
            g.fillRect(p.x, p.y, 2, 2); //simple point
            g.fill();
            g.closePath();
            g.stroke();
        }
    },

    getBounds: function() {
        // TODO: bounding with points...
        let xs = this.points.map(pt => pt.lng);
        let ys = this.points.map(pt => pt.lat);

        let xmin = Math.min(...xs);
        let ymin = Math.min(...ys);
        let xmax = Math.max(...xs);
        let ymax = Math.max(...ys);

        let southWest = L.latLng(ymin, xmin),
            northEast = L.latLng(ymax, xmax);
        let bounds = L.latLngBounds(southWest, northEast); // TODO FIX ERROR ? half-pixel?
        return bounds;
    }
});

L.canvasLayer.simpleLonLat = function(lonslats, options) {
    return new L.CanvasLayer.SimpleLonLat(lonslats, options);
};

L.CanvasLayer.Field = L.CanvasLayer.extend({
    options: {
        mouseMoveCursor: {
            value: 'pointer',
            noValue: 'default'
        },
        opacity: 1,
        onClick: null,
        onMouseMove: null,
        inFilter: null
    },

    initialize: function(field, options) {
        L.Util.setOptions(this, options);
        this._visible = true;
        if (field) {
            this.setData(field);
        }
    },

    getEvents: function() {
        var events = L.CanvasLayer.prototype.getEvents.call(this);
        events.zoomstart = this._hideCanvas.bind(this);
        events.zoomend = this._showCanvas.bind(this);
        return events;
    },

    onLayerDidMount: function() {
        this._enableIdentify();
        this._ensureCanvasAlignment();
    },

    show() {
        this._visible = true;
        this._showCanvas();
        this._enableIdentify();
    },

    hide() {
        this._visible = false;
        this._hideCanvas();
        this._disableIdentify();
    },

    isVisible() {
        return this._visible;
    },

    _showCanvas() {
        if (this._canvas && this._visible) {
            this._canvas.style.visibility = 'visible';
        }
    },

    _hideCanvas() {
        if (this._canvas) {
            this._canvas.style.visibility = 'hidden';
        }
    },

    _enableIdentify() {
        this._map.on('click', this._onClick, this);
        this._map.on('mousemove', this._onMouseMove, this);

        this.options.onClick && this.on('click', this.options.onClick, this);
        this.options.onMouseMove &&
            this.on('mousemove', this.options.onMouseMove, this);
    },

    _disableIdentify() {
        this._map.off('click', this._onClick, this);
        this._map.off('mousemove', this._onMouseMove, this);

        this.options.onClick && this.off('click', this.options.onClick, this);
        this.options.onMouseMove &&
            this.off('mousemove', this.options.onMouseMove, this);
    },

    _ensureCanvasAlignment() {
        var topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
    },

    onLayerWillUnmount: function() {
        this._disableIdentify();
    },

    needRedraw() {
        if (this._map && this._field) {
            L.CanvasLayer.prototype.needRedraw.call(this);
        }
    },

    /* eslint-disable no-unused-vars */
    onDrawLayer: function(viewInfo) {
        throw new TypeError('Must be overriden');
    },
    /* eslint-enable no-unused-vars */

    setData: function(field) {
        this.options.inFilter && field.setFilter(this.options.inFilter);
        this._field = field;
        this.needRedraw();
        this.fire('load');
    },

    setFilter: function(f) {
        this.options.inFilter = f;
        this._field && this._field.setFilter(f);
        this.needRedraw();
    },

    setOpacity: function(opacity) {
        this.options.opacity = opacity;

        if (this._canvas) {
            this._updateOpacity();
        }
        return this;
    },

    getBounds: function() {
        let bb = this._field.extent();

        let southWest = L.latLng(bb[1], bb[0]),
            northEast = L.latLng(bb[3], bb[2]);
        let bounds = L.latLngBounds(southWest, northEast);
        return bounds;
    },

    _onClick: function(e) {
        let v = this._queryValue(e);
        this.fire('click', v);
    },

    _onMouseMove: function(e) {
        let v = this._queryValue(e);
        this._changeCursorOn(v);
        this.fire('mousemove', v);
    },

    _changeCursorOn: function(v) {
        if (!this.options.mouseMoveCursor) return;

        let { value, noValue } = this.options.mouseMoveCursor;
        let style = this._map.getContainer().style;
        style.cursor = v.value !== null ? value : noValue;
    },

    _updateOpacity: function() {
        L.DomUtil.setOpacity(this._canvas, this.options.opacity);
    },

    _queryValue: function(e) {
        let v = this._field
            ? this._field.valueAt(e.latlng.lng, e.latlng.lat)
            : null;
        let result = {
            latlng: e.latlng,
            value: v
        };
        return result;
    },

    _getDrawingContext: function() {
        let g = this._canvas.getContext('2d');
        g.clearRect(0, 0, this._canvas.width, this._canvas.height);
        return g;
    }
});

L.CanvasLayer.ScalarField = L.CanvasLayer.Field.extend({
    options: {
        type: 'colormap', // [colormap|vector]
        color: null, // function colorFor(value) [e.g. chromajs.scale],
        interpolate: false, // Change to use interpolation
        vectorSize: 20, // only used if 'vector'
        arrowDirection: 'from' // [from|towards]
    },

    initialize: function(scalarField, options) {
        L.CanvasLayer.Field.prototype.initialize.call(
            this,
            scalarField,
            options
        );
        L.Util.setOptions(this, options);
    },

    _defaultColorScale: function() {
        return chroma.scale(['white', 'black']).domain(this._field.range);
    },

    setColor(f) {
        this.options.color = f;
        this.needRedraw();
    },

    /* eslint-disable no-unused-vars */
    onDrawLayer: function(viewInfo) {
        if (!this.isVisible()) return;
        this._updateOpacity();

        let r = this._getRendererMethod();
        //console.time('onDrawLayer');
        r();
        //console.timeEnd('onDrawLayer');
    },
    /* eslint-enable no-unused-vars */

    _getRendererMethod: function() {
        switch (this.options.type) {
            case 'colormap':
                return this._drawImage.bind(this);
            case 'vector':
                return this._drawArrows.bind(this);
            default:
                throw Error(`Unkwown renderer type: ${this.options.type}`);
        }
    },

    _ensureColor: function() {
        if (this.options.color === null) {
            this.setColor(this._defaultColorScale());
        }
    },

    _showCanvas() {
        L.CanvasLayer.Field.prototype._showCanvas.call(this);
        this.needRedraw(); // TODO check spurious redraw (e.g. hide/show without moving map)
    },

    /**
     * Draws the field in an ImageData and applying it with putImageData.
     * Used as a reference: http://geoexamples.com/d3-raster-tools-docs/code_samples/raster-pixels-page.html
     */
    _drawImage: function() {
        this._ensureColor();

        let ctx = this._getDrawingContext();
        let width = this._canvas.width;
        let height = this._canvas.height;

        let img = ctx.createImageData(width, height);
        let data = img.data;

        this._prepareImageIn(data, width, height);
        ctx.putImageData(img, 0, 0);
    },

    /**
     * Prepares the image in data, as array with RGBAs
     * [R1, G1, B1, A1, R2, G2, B2, A2...]
     * @private
     * @param {[[Type]]} data   [[Description]]
     * @param {Numver} width
     * @param {Number} height
     */
    _prepareImageIn(data, width, height) {
        let f = this.options.interpolate ? 'interpolatedValueAt' : 'valueAt';

        let pos = 0;
        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                let pointCoords = this._map.containerPointToLatLng([i, j]);
                let lon = pointCoords.lng;
                let lat = pointCoords.lat;

                let v = this._field[f](lon, lat); // 'valueAt' | 'interpolatedValueAt' || TODO check some 'artifacts'
                if (v !== null) {
                    let color = this._getColorFor(v);
                    let [R, G, B, A] = color.rgba();
                    data[pos] = R;
                    data[pos + 1] = G;
                    data[pos + 2] = B;
                    data[pos + 3] = parseInt(A * 255); // not percent in alpha but hex 0-255
                }
                pos = pos + 4;
            }
        }
    },

    /**
     * Draws the field as a set of arrows. Direction from 0 to 360 is assumed.
     */
    _drawArrows: function() {
        const bounds = this._pixelBounds();
        const pixelSize = (bounds.max.x - bounds.min.x) / this._field.nCols;

        var stride = Math.max(
            1,
            Math.floor(1.2 * this.options.vectorSize / pixelSize)
        );

        const ctx = this._getDrawingContext();
        ctx.strokeStyle = this.options.color;

        var currentBounds = this._map.getBounds();

        for (var y = 0; y < this._field.height; y = y + stride) {
            for (var x = 0; x < this._field.width; x = x + stride) {
                let [lon, lat] = this._field._lonLatAtIndexes(x, y);
                let v = this._field.valueAt(lon, lat);
                let center = L.latLng(lat, lon);
                if (v !== null && currentBounds.contains(center)) {
                    let cell = new Cell(
                        center,
                        v,
                        this.cellXSize,
                        this.cellYSize
                    );
                    this._drawArrow(cell, ctx);
                }
            }
        }
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

    _drawArrow: function(cell, ctx) {
        var projected = this._map.latLngToContainerPoint(cell.center);

        // colormap vs. simple color
        let color = this.options.color;
        if (typeof color === 'function') {
            ctx.strokeStyle = color(cell.value);
        }

        const size = this.options.vectorSize;
        ctx.save();

        ctx.translate(projected.x, projected.y);

        let rotationRads = (90 + cell.value) * Math.PI / 180; // from, by default
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

    /**
     * Gets a chroma color for a pixel value, according to 'options.color'
     */
    _getColorFor(v) {
        let c = this.options.color; // e.g. for a constant 'red'
        if (typeof c === 'function') {
            c = this.options.color(v);
        }
        let color = chroma(c); // to be more flexible, a chroma color object is always created || TODO improve efficiency
        return color;
    }
});

L.canvasLayer.scalarField = function(scalarField, options) {
    return new L.CanvasLayer.ScalarField(scalarField, options);
};

L.CanvasLayer.VectorFieldAnim = L.CanvasLayer.Field.extend({
    options: {
        paths: 800,
        color: 'white', // html-color | function colorFor(value) [e.g. chromajs.scale]
        width: 1.0, // number | function widthFor(value)
        fade: 0.96, // 0 to 1
        duration: 20, // milliseconds per 'frame'
        maxAge: 200, // number of maximum frames per path
        velocityScale: 1 / 5000
    },

    initialize: function(vectorField, options) {
        L.CanvasLayer.Field.prototype.initialize.call(
            this,
            vectorField,
            options
        );
        L.Util.setOptions(this, options);

        this.timer = null;
    },

    onLayerDidMount: function() {
        L.CanvasLayer.Field.prototype.onLayerDidMount.call(this);
        this._map.on('move resize', this._stopAnimation, this);
    },

    onLayerWillUnmount: function() {
        L.CanvasLayer.Field.prototype.onLayerWillUnmount.call(this);
        this._map.off('move resize', this._stopAnimation, this);
        this._stopAnimation();
    },

    _hideCanvas: function _showCanvas() {
        L.CanvasLayer.Field.prototype._hideCanvas.call(this);
        this._stopAnimation();
    },

    onDrawLayer: function(viewInfo) {
        if (!this._field || !this.isVisible()) return;

        this._updateOpacity();

        let ctx = this._getDrawingContext();
        let paths = this._prepareParticlePaths();

        this.timer = d3.timer(function() {
            _moveParticles();
            _drawParticles();
        }, this.options.duration);

        let self = this;

        /**
         * Builds the paths, adding 'particles' on each animation step, considering
         * their properties (age / position source > target)
         */
        function _moveParticles() {
            // let screenFactor = 1 / self._map.getZoom(); // consider using a 'screenFactor' to ponderate velocityScale
            paths.forEach(function(par) {
                if (par.age > self.options.maxAge) {
                    // restart, on a random x,y
                    par.age = 0;
                    self._field.randomPosition(par);
                }

                let vector = self._field.valueAt(par.x, par.y);
                if (vector === null) {
                    par.age = self.options.maxAge;
                } else {
                    // the next point will be...
                    let xt = par.x + vector.u * self.options.velocityScale; //* screenFactor;
                    let yt = par.y + vector.v * self.options.velocityScale; //* screenFactor;

                    if (self._field.hasValueAt(xt, yt)) {
                        par.xt = xt;
                        par.yt = yt;
                        par.m = vector.magnitude();
                    } else {
                        // not visible anymore...
                        par.age = self.options.maxAge;
                    }
                }
                par.age += 1;
            });
        }

        /**
         * Draws the paths on each step
         */
        function _drawParticles() {
            // Previous paths...
            let prev = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            //ctx.globalCompositeOperation = 'source-over';
            ctx.globalCompositeOperation = prev;

            // fading paths...
            ctx.fillStyle = `rgba(0, 0, 0, ${self.options.fade})`;
            ctx.lineWidth = self.options.width;
            ctx.strokeStyle = self.options.color;

            // New paths
            paths.forEach(function(par) {
                self._drawParticle(viewInfo, ctx, par);
            });
        }
    },

    _drawParticle(viewInfo, ctx, par) {
        let source = new L.latLng(par.y, par.x);
        let target = new L.latLng(par.yt, par.xt);

        if (
            viewInfo.bounds.contains(source) &&
            par.age <= this.options.maxAge
        ) {
            let pA = viewInfo.layer._map.latLngToContainerPoint(source);
            let pB = viewInfo.layer._map.latLngToContainerPoint(target);

            ctx.beginPath();
            ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(pB.x, pB.y);

            // next-step movement
            par.x = par.xt;
            par.y = par.yt;

            // colormap vs. simple color
            let color = this.options.color;
            if (typeof color === 'function') {
                ctx.strokeStyle = color(par.m);
            }

            let width = this.options.width;
            if (typeof width === 'function') {
                ctx.lineWidth = width(par.m);
            }

            ctx.stroke();
        }
    },

    _prepareParticlePaths: function() {
        let paths = [];

        for (var i = 0; i < this.options.paths; i++) {
            let p = this._field.randomPosition();
            p.age = this._randomAge();
            paths.push(p);
        }
        return paths;
    },

    _randomAge: function() {
        return Math.floor(Math.random() * this.options.maxAge);
    },

    _stopAnimation: function() {
        if (this.timer) {
            this.timer.stop();
        }
    }
});

L.canvasLayer.vectorFieldAnim = function(vectorField, options) {
    return new L.CanvasLayer.VectorFieldAnim(vectorField, options);
};

L.Control.ColorBar = L.Control.extend({
    options: {
        position: 'bottomleft',
        width: 300, // for colorbar itself (control is wider)
        height: 15,
        margin: 15,
        background: '#fff',
        textColor: 'black',
        steps: 100,
        decimals: 2,
        units: 'uds', // ej: m/s
        title: 'Legend', // ej: Ocean Currents
        labels: [], // empty for no labels
        labelFontSize: 10,
        labelTextPosition: 'middle' // start | middle | end
    },

    initialize: function(color, range, options) {
        this.color = color; // 'chromajs' scale function
        this.range = range; // [min, max]
        L.Util.setOptions(this, options);
    },

    onAdd: function(map) {
        this._map = map;
        let div = L.DomUtil.create(
            'div',
            'leaflet-control-colorBar leaflet-bar leaflet-control'
        );
        div.style.padding = '10px';

        L.DomEvent
            .addListener(div, 'click', L.DomEvent.stopPropagation)
            .addListener(div, 'click', L.DomEvent.preventDefault);
        div.style.backgroundColor = this.options.background;
        div.style.cursor = 'text';
        div.innerHTML = this.title() + this.palette();
        return div;
    },

    title: function() {
        let d = document.createElement('div');
        d3
            .select(d)
            .append('span')
            .style('color', this.options.textColor)
            .style('display', 'block')
            .style('margin-bottom', '5px')
            .attr('class', 'leaflet-control-colorBar-title')
            .text(this.options.title);
        return d.innerHTML;
    },

    palette: function() {
        let d = document.createElement('div');
        let svg = this._createSvgIn(d);

        this._appendColorBarTo(svg);

        if (this.options.labels) {
            this._appendLabelsTo(svg);
        }

        return d.innerHTML;
    },

    _createSvgIn: function(d) {
        let spaceForLabels = this.options.labels ? this.options.margin : 0;
        let svg = d3
            .select(d)
            .append('svg')
            .attr('width', this.options.width + this.options.margin * 2)
            .attr('height', this.options.height + spaceForLabels);
        return svg;
    },

    _appendColorBarTo: function(svg) {
        const colorPerValue = this._getColorPerValue();
        const w = this.options.width / colorPerValue.length;

        let groupBars = svg.append('g').attr('id', 'colorBar-buckets');
        let buckets = groupBars
            .selectAll('rect')
            .data(colorPerValue)
            .enter()
            .append('rect');
        buckets
            .attr('x', (d, i) => i * w + this.options.margin)
            .attr('y', () => 0)
            .attr('height', () => this.options.height /*w * 4*/)
            .attr('width', () => w)
            .attr('stroke-width', 2)
            .attr('stroke-linecap', 'butt')
            .attr('stroke', d => d.color.hex())
            .attr('fill', d => d.color.hex());
        buckets
            .append('title')
            .text(
                d =>
                    `${d.value.toFixed(this.options.decimals)} ${this.options
                        .units}`
            );
    },

    _appendLabelsTo: function(svg) {
        const positionPerLabelValue = this._getPositionPerLabelValue();
        //const w = this.options.width / colorPerValue.length;
        let groupLabels = svg.append('g').attr('id', 'colorBar-labels');
        let labels = groupLabels
            .selectAll('text')
            .data(positionPerLabelValue)
            .enter()
            .append('text');
        labels
            .attr('x', d => d.position + this.options.margin)
            .attr('y', this.options.height + this.options.margin)
            .attr('font-size', `${this.options.labelFontSize}px`)
            .attr('text-anchor', this.options.labelTextPosition)
            .attr('fill', this.options.textColor)
            .attr('class', 'leaflet-control-colorBar-label')
            .text(d => `${d.value.toFixed(this.options.decimals)}`);
    },

    _getColorPerValue: function() {
        const [min, max] = this.range;
        let delta = (max - min) / this.options.steps;
        let data = d3.range(min, max + delta, delta);
        let colorPerValue = data.map(d => {
            return {
                value: d,
                color: this.color(d)
            };
        });
        return colorPerValue;
    },

    _getPositionPerLabelValue: function() {
        var xPositionFor = d3
            .scaleLinear()
            .range([0, this.options.width])
            .domain(this.range);
        let data = this.options.labels;
        let positionPerLabel = data.map(d => {
            return {
                value: d,
                position: xPositionFor(d)
            };
        });
        return positionPerLabel;
    }
});

L.control.colorBar = function(color, range, options) {
    return new L.Control.ColorBar(color, range, options);
};
