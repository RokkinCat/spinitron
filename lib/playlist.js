var self = this,
    cheerio = require('cheerio'),
    crypto = require('crypto'),
    http = require('http'),
    queryManager = require('querystring'),
    itunes = require('itunes'),
    redis = require('redis'),
    redisClient = redis.createClient(),
    apiHost = "spinitron.com",
    apiUrl = "/radio/playlist.php";

/**
 * Creates a new Playlist instance
 * @param {string} station Station ID
 * @constructor
 */
function Playlist(station) {
    self.station = station;
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

function getPlaylist(opts, callback) {
    process.nextTick(function () {
        var cache;

        if (opts.hasOwnProperty("cache")) {
            cache = opts["cache"];
            delete opts["cache"];
        } else {
            if (Object.keys(opts).length) {
                // cache this for an hour
                cache = 3600000;
            } else {
                // cache this for 30 seconds
                cache = 30000;
            }
        }

        // check if this in the cache
        var cacheKey = "SpinPapiCache-" + computeParamsHash(opts);
        redisClient.get(cacheKey, function (err, reply) {
            if (reply !== null) {
                // have in cache
                callback(JSON.parse(reply));
            } else {
                opts["ptype"] = "s";
                opts["station"] = self.station;
                // don't have in cache
                http.get({
                        hostname: apiHost,
                        path: apiUrl + "?" + queryManager.stringify(opts)
                    }, function (res) {
                        if (res.statusCode == 200) {
                            var responseData = "";
                            res.on('data', function (chunk) {
                                responseData += chunk;
                            });

                            res.on('end', function () {
                                var $ = cheerio.load(responseData, {
                                    xmlMode: true
                                });

                                var songs = [];
                                var totalSongs = $(".plblock").children(".f2row").length;
                                var doneSongs = 0;
                                $(".plblock").children(".f2row").each(function () {
                                    var data = {
                                        song: {},
                                        artist: {},
                                        disk: {},
                                        label: {}
                                    };

                                    // Pull the data out of the html
                                    // Ff something is broken this is most likely where the problem is.
                                    data.song["id"] = $(this).find(".nfo a").first().attr("name");
                                    data.song["time"] = $(this).find(".st").text();
                                    data.artist["name"] = $(this).find(".aw").text().replace(/“|”/, "");

                                    var songLink = $(this).find(".aw a").attr("href");
                                    if (typeof songLink != "undefined") {
                                        if (songLink.indexOf("?") != -1) {
                                            var qsa = queryManager.parse(songLink.substring(songLink.indexOf("?")));
                                            if (qsa.hasOwnProperty("dbid")) {
                                                data.artist["id"] = qsa["dbid"];
                                            }
                                        }
                                    }
                                    if (!data.artist.hasOwnProperty("id")) {
                                        data.artist["id"] = null;
                                    }
                                    data.song["name"] = $(this).find(".sn").text().replace(/“|”/, "");

                                    var diskLink = $(this).find(".dn a").attr("href");
                                    if (typeof diskLink != "undefined") {
                                        if (diskLink.indexOf("?") != -1) {
                                            var qsa = queryManager.parse(diskLink.substring(diskLink.indexOf("?")));
                                            if (qsa.hasOwnProperty("dbid")) {
                                                data.disk["id"] = qsa["dbid"];
                                            }
                                        }
                                    }
                                    if (!data.disk.hasOwnProperty("id")) {
                                        data.disk["id"] = null;
                                    }
                                    data.disk["name"] = $(this).find(".dn").text().replace(/“|”/, "");

                                    var labelLink = $(this).find(".ld a").attr("href");
                                    if (typeof labelLink != "undefined") {
                                        if (labelLink.indexOf("?") != -1) {
                                            var qsa = queryManager.parse(labelLink.substring(labelLink.indexOf("?")));
                                            if (qsa.hasOwnProperty("dbid")) {
                                                data.label["id"] = qsa["dbid"];
                                            }
                                        }
                                    }
                                    if (!data.label.hasOwnProperty("id")) {
                                        data.label["id"] = null;
                                    }
                                    data.label["name"] = $(this).find(".ld a").text().replace(/“|”/g, "");

                                    var year = $(this).find(".ld").text().match(/\(.*([0-9]{4})\)/);
                                    if(year !== null) {
                                        data.label["year"] = year[1];
                                    } else {
                                        data.label["year"] = null;
                                    }

                                    data.song["code"] = $(this).find("fg").text();

                                    // find the song in itunes
                                    if (data.song.hasOwnProperty("name") && data.artist.hasOwnProperty("name") && data.disk.hasOwnProperty("name")) {
                                        itunes.search({
                                            term: data.song["name"],
                                            attribute: "songTerm",
                                            entity: "song"
                                        }, function (itunesSongs) {
                                            itunesSongs.results.every(function (song) {
                                                if (song.artistName.toLowerCase() == data.artist["name"].toLowerCase() && song.collectionName.toLowerCase() == data.disk["name"].toLowerCase()) {
                                                    if (song.hasOwnProperty("artworkUrl30")) {
                                                        data.disk["artworkUrl30"] = song["artworkUrl30"];
                                                    }

                                                    if (song.hasOwnProperty("artworkUrl60")) {
                                                        data.disk["artworkUrl60"] = song["artworkUrl60"];
                                                    }

                                                    if (song.hasOwnProperty("artworkUrl100")) {
                                                        data.disk["artworkUrl100"] = song["artworkUrl100"];
                                                    }

                                                    if (song.hasOwnProperty("trackViewUrl")) {
                                                        data.disk["itunes"] = song["trackViewUrl"];
                                                    }
                                                    return false;
                                                } else {
                                                    return true;
                                                }
                                            });
                                            songs.push(data);
                                            if(totalSongs == ++doneSongs) {
                                                // cache it
                                                if(cache > 0) {
                                                    redisClient.psetex(cacheKey, cache, JSON.stringify(songs));
                                                }

                                                callback(songs);
                                            }
                                        });
                                    } else {
                                        songs.push(data);
                                        if(totalSongs == ++doneSongs) {
                                            // cache it
                                            if(cache > 0) {
                                                redisClient.psetex(cacheKey, cache, JSON.stringify(songs));
                                            }

                                            callback(songs);
                                        }
                                    }
                                });


                            });
                        }
                    }
                )
            }
        });
    });
}

Playlist.prototype.getPlaylist = getPlaylist;
module.exports = Playlist;