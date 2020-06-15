var self = this,
    crypto = require('crypto'),
    moment = require('moment'),
    http = require('http'),
    queryManager = require('querystring'),
    redis = require('redis'),
    redisClient = redis.createClient(),
    apiVersion = 2,
    apiHost = "spinitron.com",
    apiUrl = "/public/spinpapi.php";

/**
 * Creates a new SpinPapi instance
 * @param {string} station Station ID
 * @param {string} user API username
 * @param {string} secret API password
 * @constructor
 */
function SpinPapi(station, user, secret) {
    self.station = station;
    self.user = user;
    self.secret = secret;
}

/**
 * Returns information pertaining to a single instance of a song logged in a playlist
 * @param {{Song: number=, cache: number=}} opts
 * @param {function(object)} callback Function called after the query is complete
 */
function getSong(opts, callback) {
    process.nextTick(function() {
        var cache;

        if(opts.hasOwnProperty("cache")) {
            cache = opts["cache"];
            delete opts["cache"];
        } else {
            if(opts.hasOwnProperty("SongID")) {
                // songID is set, cache this for a week
                cache = 604800000;
            } else {
                // songID is not set, cache this for a minute
                cache = 60000;
            }
        }

        query.call(self, "getSong", opts, callback, cache);
    });
}

/**
 * Returns song information for a number of songs, either in a playlist or most recent
 * @param {{PlaylistID: number=, cache: number=}} opts
 * @param {function(object)} callback Function called after the query is complete
 */
function getSongs(opts, callback) {
    process.nextTick(function() {
        var cache;

        if(opts.hasOwnProperty("cache")) {
            cache = opts["cache"];
            delete opts["cache"];
        } else {
            if(opts.hasOwnProperty("PlaylistID")) {
                // playlistID is set, cache this for a week
                cache = 604800000;
            } else {
                // playlistID is not set, cache this for a minute
                cache = 60000;
            }
        }

        query.call(self, "getSongs", opts, callback, cache);
    });
}

/**
 * Returns PlaylistID of the "current" playlist
 * @param {{cache: number=}} opts
 * @param {function(object)} callback Function called after the query is complete
 */
function getCurrentPlaylist(opts, callback) {
    process.nextTick(function() {
        var cache;

        if(opts.hasOwnProperty("cache")) {
            cache = opts["cache"];
            delete opts["cache"];
        } else {
            //cache this for a minute
            cache = 60000;
        }

        query.call(self, "getCurrentPlaylist", opts, callback, cache);
    });
}

/**
 * Returns metadata pertaining to a single playlist
 * @param {{PlaylistID: number=, cache: number=}} opts
 * @param {function(object)} callback Function called after the query is complete
 */
function getPlaylistInfo(opts, callback) {
    process.nextTick(function() {
        var cache;

        if(opts.hasOwnProperty("cache")) {
            cache = opts["cache"];
            delete opts["cache"];
        } else {
            if(opts.hasOwnProperty("PlaylistID")) {
                // playlistID is set, cache this for a week
                cache = 604800000;
            } else {
                // playlistID is not set, cache this for a minute
                cache = 60000;
            }
        }

        query.call(self, "getPlaylistInfo", opts, callback, cache);
    });
}

/**
 * Returns the metadata describing a number of playlists
 * @param {{UserID: number=, ShowID: number=, NDays:number=, EndData:string=, Num:number=, cache: number=}} opts
 * @param {function(object)} callback Function called after the query is complete
 */
function getPlaylistsInfo(opts, callback) {
    process.nextTick(function() {
        var cache;

        if(opts.hasOwnProperty("cache")) {
            cache = opts["cache"];
            delete opts["cache"];
        } else {
            // cache this for a week
            cache = 604800000;
        }

        query.call(self, "getPlaylistsInfo", opts, callback, cache);
    });
}

/**
 * Returns metadata pertaining to a single show
 * @param {{ShowID: number=, cache: number=}} opts
 * @param {function(object)} callback Function called after the query is complete
 */
function getShowInfo(opts, callback) {
    process.nextTick(function() {
        var cache;

        if(opts.hasOwnProperty("cache")) {
            cache = opts["cache"];
            delete opts["cache"];
        } else {
            if(opts.hasOwnProperty("ShowID")) {
                // showID is set, cache this for a week
                cache = 604800000;
            } else {
                // showID is not set, cache this for a minute
                cache = 60000;
            }
        }

        query.call(self, "getShowInfo", opts, callback, cache);
    });
}

/**
 * Returns metadata pertaining to one or more shows in the program schedule
 * @param {{When: number|string=, StartHour: number, cache: number=}} opts
 * @param {function(object)} callback Function called after the query is complete
 */
function getRegularShowsInfo(opts, callback) {
    process.nextTick(function() {
        var cache;

        if(opts.hasOwnProperty("cache")) {
            cache = opts["cache"];
            delete opts["cache"];
        } else {
            // cache this for 15 minutes
            cache = 900000;
        }

        query.call(self, "getRegularShowsInfo", opts, callback, cache);
    });
}

/**
 * Given an object alphabetically sorts the object and returns an array.
 * @param {object} o Object to sort
 * @returns {Array.<Array>} Returns in array with the sorted values. It will be structured as [[key1, value1], [key2, value2]]
 */
function sortObjectToArray(o) {
    var a = [],i;
    for(i in o){
        if(o.hasOwnProperty(i)){
            a.push([i,o[i]]);
        }
    }
    a.sort(function(a,b){ return a[0]>b[0]?1:-1; })
    return a;
}

/**
 * Computes the SHA256 HMAC for the given query string
 * @param {string} queryString
 * @param {string} secret
 * @returns {*|String} The binary base64 encoded HMAC.
 */
function sign(queryString, secret) {
    var hmac = crypto.createHmac('sha256', secret);
    hmac.setEncoding('binary');

    hmac.write(apiHost + "\n" + apiUrl + "\n");

    hmac.write(queryString);
    hmac.end();

    return new Buffer(hmac.read(), 'binary').toString('base64');
}

/**
 * Computes the md5sum of the given parameters object
 * @param {object} parameters Parameters to JSON encode and then md5 hashed
 * @returns {*|String} the md5sum
 */
function computeParamsHash(parameters) {
    var md5sum = crypto.createHash('md5');
    md5sum.setEncoding('binary');
    md5sum.write(JSON.stringify(parameters));
    md5sum.end();
    return new Buffer(md5sum.read(), 'binary').toString('base64');
}

/**
 * Sends a query to SpinPapi
 * @param {string} method Method to send to the API
 * @param {object} parameters Parameters to send to the API
 * @param {function(object)} callback Function called after the query is complete
 * @param {number=} cache Number of milliseconds to cache the data for. If undefined a default of 1800000 milliseconds is used
 */
function query(method, parameters, callback, cache) {
    process.nextTick(function() {
        if(typeof cache == "undefined") {
            cache = 1800000;
        }

        parameters["method"] = method;
        parameters["station"] = self.station;
        parameters["papiversion"] = apiVersion;
        parameters["papiuser"] = self.user;

        // check if this is in the cache
        var cacheKey = "SpinPapiCache-" + computeParamsHash(parameters);
        redisClient.get(cacheKey, function(err, reply) {
            if(reply !== null) {
                callback(JSON.parse(reply));
            } else {
                parameters["timestamp"] = moment().utc().format("YYYY-MM-DDTHH:mm:ss\\Z");

                var queryString = "";

                var sortedParams = sortObjectToArray(parameters);
                sortedParams.forEach(function(parameter) {
                    queryString += encodeURIComponent(parameter[0]) + "=" + encodeURIComponent(parameter[1]) + "&";
                });
                queryString += "signature=" + encodeURIComponent(sign(queryString.slice(0, -1), self.secret));

                http.get({
                    hostname: apiHost,
                    path: apiUrl + "?" + queryString
                }, function(res) {
                    if(res.statusCode == 200) {
                        var responseData = "";

                        res.on('data', function(chunk) {
                            responseData += chunk;
                        });

                        res.on('end', function() {
                            // cache the response if it wasn't an error
                            var response = JSON.parse(responseData);

                            if(response.success === true && cache > 0) {
                                redisClient.psetex(cacheKey, cache, responseData);
                            }

                            callback(response);
                        });
                    }
                });
            }
        });
    });
}

SpinPapi.prototype.getSong = getSong;
SpinPapi.prototype.getSongs = getSongs;
SpinPapi.prototype.getCurrentPlaylist = getCurrentPlaylist;
SpinPapi.prototype.getPlaylistInfo = getPlaylistInfo;
SpinPapi.prototype.getPlaylistsInfo = getPlaylistsInfo;
SpinPapi.prototype.getShowInfo = getShowInfo;
SpinPapi.prototype.getRegularShowsInfo = getRegularShowsInfo;
module.exports = SpinPapi;