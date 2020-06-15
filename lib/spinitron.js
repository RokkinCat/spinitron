var SpinPapiClient = require('./spinPapi')
var PlaylistClient = require('./playlist')

var spinitron = exports;

/**
 *
 * @param station
 * @param user
 * @param secret
 * @returns {SpinPapi}
 */
spinitron.createSpinPapiClient = function(station, user, secret) {
    return new SpinPapiClient(station, user, secret);
}

/**
 *
 * @param station
 * @returns {PlaylistClient}
 */
spinitron.createPlaylistClient = function(station) {
    return new PlaylistClient(station);
}