/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

var client_id = 'e6b884b4730c4c30bf96e5ecaa65ad1b'; // Your client id
var client_secret = '88e6fd057f29495ea11fe04dd304d143'; // Your secret
var redirect_uri = 'http://localhost:3000/callback'; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function (length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
    .use(cors())
    .use(cookieParser());

app.get('/login', function (req, res) {

    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    // your application requests authorization
    var scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative streaming';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        }));
});

app.get('/callback', function (req, res) {

    // your application requests refresh and access tokens
    // after checking the state parameter

    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
    } else {
        res.clearCookie(stateKey);
        var authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
            },
            json: true
        };
        request.post(authOptions, function (error, response, body) {
            if (!error && response.statusCode === 200) {

                var access_token = body.access_token,
                    refresh_token = body.refresh_token;

                var options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: { 'Authorization': 'Bearer ' + access_token },
                    json: true
                };

                // use the access token to access the Spotify Web API
                request.get(options, function (error, response, body) {
                    console.log(body);
                });

                // we can also pass the token to the browser to make requests from there
                res.redirect('/#' +
                    querystring.stringify({
                        access_token: access_token,
                        refresh_token: refresh_token
                    }));
            } else {
                res.redirect('/#' +
                    querystring.stringify({
                        error: 'invalid_token'
                    }));
            }
        });
    }
});

app.get('/refresh_token', function (req, res) {

    // requesting access token from refresh token
    var refresh_token = req.query.refresh_token;
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
        form: {
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        },
        json: true
    };

    request.post(authOptions, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var access_token = body.access_token;
            res.send({
                'access_token': access_token
            });
            //console.log("Refresh Token");
        }
    });
});

app.get('/createPlaylist', function (req, res) {
    var artistName = req.query.artistName;
    var accessToken = req.query.access_token;

    // Search for the artist
    var searchOptions = {
        url: `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
        headers: {
            'Authorization': 'Bearer ' + accessToken
        },
        json: true
    };
    request.get(searchOptions, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            artistName = body.artists.items[0].name;
            var artistId = body.artists.items[0].id;

            // Get the top tracks of the artist
            var topTracksOptions = {
                url: `https://api.spotify.com/v1/artists/${artistId}/top-tracks?country=US`,
                headers: {
                    'Authorization': 'Bearer ' + accessToken
                },
                json: true
            };
            request.get(topTracksOptions, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    res.send(body);
                    var trackUris = body.tracks.map(track => track.uri);
                    //var trackTitles = body.tracks.map(track => track.name);

                    // Create a playlist
                    var createPlaylistOptions = {
                        url: `https://api.spotify.com/v1/me/playlists`,
                        headers: {
                            'Authorization': 'Bearer ' + accessToken,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: `${artistName} Top Tracks`,
                            public: false
                        })
                    };
                    request.post(createPlaylistOptions, function (error, response, body) {
                        if (!error && response.statusCode === 201) {
                            var playlistData = JSON.parse(body);
                            var playlistId = playlistData.id;

                            // Add tracks to the playlist
                            var addTracksOptions = {
                                url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
                                headers: {
                                    'Authorization': 'Bearer ' + accessToken,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    uris: trackUris
                                })
                            };

                            request.post(addTracksOptions, function (error, response, body) {
                                if (!error && response.statusCode === 201) {
                                } else {
                                    res.send('Failed to add tracks to the playlist.');
                                }
                            });
                        } else {
                            res.send('Failed to create a playlist.');
                        }
                    });
                } else {
                    res.send('Failed to get the artist\'s top tracks.');
                }
            });
        } else {
            res.send('Artist not found.');
        }
    });
});



console.log('Listening on 3000');
app.listen(3000);
