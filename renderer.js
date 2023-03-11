const { Console } = require('console');
const MediaRendererClient = require('upnp-mediarenderer-client');
const { exec } = require('child_process');
const os = require('os');
const httpProxy = require('http-proxy');

// TODO: Ideally the author will accept the pull request and re-publish. Otherwise tie it to my fork.
const Ytcr = require('yt-cast-receiver');

// Use ports 3000, 3001, 3002 etc for successive YTCRs
const YTCR_BASE_PORT = 3000;

// Use port 800n for the HTTPS->HTTP proxying of the media
const PROXY_BASE_PORT = 8000;

// TODO Does this clean up nicely? YTCR instance disappear from the menu in the youtube app? Port freed etc?

/**
 * Class controlling a single upnp media renderer.
 * It implements yt-cast-receiver.Player so that it can receive and translate casts from YouTube.
 */
class Renderer extends Ytcr.Player {

    constructor(location, index, timeout)
    {
        // Call the Ytcr.Player constructor
        super();

        console.log("Creating new renderer: " + location);
        this.location = location;
        this.index = index;
        this.timeout = timeout;
        this.httpServer = null;
        this.refresh();

        // Instantiate the mediarender client
        this.client = new MediaRendererClient(location);

        // No errors so far
        this.error = false

        // Get device details
        const obj = this;
        this.client.getDeviceDescription(function(err, description) {
            if (err) {
                console.log("Failed to get device description from " + obj.location);
                return;
            }

            // Create a friendly string from the above, which we will name the YouTube cast receiver
            // e.g. "Living Room (Pure Jongo A2)"
            const friendlyName = description.friendlyName;
            const manufacturer = description.manufacturer;
            const modelName = description.modelName;
            obj.friendlyName = `🔊 ${friendlyName} (${manufacturer} ${modelName})`;
            console.log(`[${obj.friendlyName}]: New renderer created, timeout ${obj.timeout}`);

            // TODO Select audio or video according to the capabilities of the renderer
            // obj.client.getSupportedProtocols( function(error, protocols) {
            //     if(err) {
            //         console.log(`[${obj.friendlyName}]: getSupportedProtocols error:`);
            //         console.log(err);
            //     } else {
            //         console.log(`[${obj.friendlyName}]: getSupportedProtocols:`);
            //         console.log(protocols);
            //     }
            // });

            // Create a youtube cast receiver
            const options = {port: YTCR_BASE_PORT + obj.index,
                             friendlyName: obj.friendlyName,
                             manufacturer: description.manufacturer,
                             modelName: description.modelName}; 
            obj.ytcr = Ytcr.instance(obj, options);
            obj.ytcr.start();

            obj.ytcr.setDebug(true);
            obj.ytcr.on('connected', client => {
                console.log(`Connected to ${client.name}`);
                console.log(`${client}`);
            });
        });
    }

    refresh() {
        this.lastSeenTime = Number(process.hrtime.bigint() / 1000000000n);
        console.log("Refreshed renderer " + this.location + " to " + this.lastSeenTime);
    }

    isStale() {
        // If an error occurred in setup, we are stale. The program will delete us and recreate.e
        if (this.error) return true;

        // If we have not been refreshed (i.e. discovered again) in this.timeout, we are stale.
        const now = Number(process.hrtime.bigint()  / 1000000000n);
        if (this.lastSeenTime + this.timeout < now) return true;

        return false;
    }

    getAudioUrl(videoId, callback) {
        const obj = this;

        // Call yt-dlp to get the audio URL
        exec(`yt-dlp -f bestaudio[ext=m4a] --get-url https://www.youtube.com/watch?v=${videoId}`, function(err, stdout, stderr) {
            if(err) {
                console.log(`[${obj.friendlyName}]: Unable to get audio URL using yt-dlp. Using youtube-dl but this is slower!`);

                // Enable to see what went wrong
                // console.log(err);
                // if(stdout) {
                //     console.log(stdout);
                // }
                // if(stderr) {
                //     console.log(stderr);
                // }

                exec(`youtube-dl -f bestaudio[ext=m4a] --get-url https://www.youtube.com/watch?v=${videoId}`, function(err, stdout, stderr) {
                    if(err) {
                        console.log(`[${obj.friendlyName}]: Error getting URL from youtube-dl:`);
                        // Enable to see what went wrong
                        // console.log(err);
                        // if(stdout) {
                        //     console.log(stdout);
                        // }
                        // if(stderr) {
                        //     console.log(stderr);
                        // }
                    } else {
                        // Call the callback with the retrieved URL
                        const audioUrl = stdout.toString().trim();
                        console.log(`[${obj.friendlyName}]: Media URL: ${audioUrl}`);
                        callback(audioUrl);
                    }
                });
            }
            else {
                // Call the callback with the retrieved URL
                const audioUrl = stdout.toString().trim();
                console.log(`[${obj.friendlyName}]: Media URL: ${audioUrl}`);
                callback(audioUrl);
            }
        });
    }

    /**
     * The methods implementing yt-cast-receiver.Player
     */
    async play(videoId, position = 0) {
        console.log(`[${this.friendlyName}]: Play ${videoId} at position ${position}s`);
        const obj = this;

        this.getAudioUrl(videoId, function(audioUrl) {
            const url = new URL(audioUrl);

            // Stop the existing proxy (if there is one)
            if(obj.proxy) {
                obj.proxy.close();
            }

            // Create an HTTP -> HTTPS proxy, allowing the renderer to retrieve the file over HTTP
            const proxyPort = PROXY_BASE_PORT + obj.index;
            const proxyOptions = {
                target: {
                    protocol: url.protocol,
                    host: url.host,
                    port: url.port || 443
                },
                changeOrigin: true
            };
            obj.proxy = httpProxy.createProxyServer(proxyOptions);
            obj.proxy.listen(proxyPort);

            // Create a URL to give to the renderer with the same path and params, but starting http://our-hostname:port
            const hostname = os.hostname();
            const rendererUrl = `http://${hostname}:${proxyPort}/${url.pathname}${url.search}`;

            // Load and play the URL on the renderer
            const options = { autoplay: true,
                                contentType: 'audio/mp4' };
            obj.client.load(rendererUrl, options, function(err, result) {
                if(err) {
                    console.log(`[${obj.friendlyName}]: Error loading media:`)
                    console.log(err);
                }
                else {
                    obj.notifyPlayed();
                }
            });
        });
    }

    async pause() {
        console.log(`[${this.friendlyName}]: Pause`);
        const obj = this;

        // Pause the dlna renderer
        this.client.pause(function(err, result) {
            if (err) {
                console.log(`[${obj.friendlyName}]: Pause error:`);
                console.log(err);
            } else {
                console.log(`[${obj.friendlyName}]: Paused`);

                // Notify YouTube that we have paused
                obj.notifyPaused();
            }
        });
    }

    async resume() {
        console.log(`[${this.friendlyName}]: Resume`);
        const obj = this;

        // Play (=resume) the dlna renderer
        this.client.play(function(err, result) {
            if (err) {
                console.log(`[${obj.friendlyName}]: Resume error:`);
                console.log(err);
            } else {
                console.log(`[${obj.friendlyName}]: Resumed`);

                // Notify YouTube that we have resumed
                obj.notifyResumed();
            }
        });
    }

    async stop() {
        console.log(`[${this.friendlyName}]: Stop`);
        const obj = this;
        
        // Stop the dlna renderer
        this.client.stop(function(err, result) {
            if (err) {
                console.log(`[${obj.friendlyName}]: Stop error:`);
                console.log(err);
            } else {
                console.log(`[${obj.friendlyName}]: Stopped`);

                // Notify YouTube that we have stopped
                obj.notifyStopped();
            }
        });
    }

    async seek(position, statusBeforeSeek) {
        console.log(`[${this.friendlyName}]: Seek to ${position}s, statusBeforeSeek ${statusBeforeSeek}`);
        const obj = this;

        // Tell the dlna renderer to seek
        this.client.seek(position, function(err, result) {
            if (err) {
                console.log(`[${obj.friendlyName}]: Seek error:`);
                console.log(err);
            } else {
                console.log(`[${obj.friendlyName}]: Seeked`);

                // Notify YouTube that we have seeked
                obj.notifySeeked(statusBeforeSeek);
            }
        });
    }

    async getVolume() {
        console.log(`[${this.friendlyName}]: getVolume`);
        const obj = this;

        const promise = new Promise(function(resolve, reject) {
            obj.client.getVolume(function(err, result) {
                if(err) {
                    console.log(`[${obj.friendlyName}]: getVolume error:`);
                    console.log(err);
                    reject(err);
                } else {
                    console.log(`[${obj.friendlyName}]: getVolume ${result}`);
                    resolve(result);
                }
            })
        });

        return promise;
    }

    async setVolume(volume) {
        console.log(`[${this.friendlyName}]: setVolume to ${volume}`);
        const obj = this;

        // Set the volume on the dlna renderer
        this.client.setVolume(volume, function(err, result) {
            if (err) {
                console.log(`[${obj.friendlyName}]: setVolume error:`);
                console.log(err);
            } else {
                console.log(`[${obj.friendlyName}]: Volume set`);

                // Notify YouTube that we have stopped
                obj.notifyVolumeChanged();
            }
        });
    }

    async getPosition() {
        console.log(`[${this.friendlyName}]: getPosition`);

        const obj = this;

        const promise = new Promise(function(resolve, reject) {
            obj.client.getPosition(function(err, result) {
                if(err) {
                    console.log(`[${obj.friendlyName}]: getPosition error:`);
                    console.log(err);
                    reject(err);
                } else {
                    console.log(`[${obj.friendlyName}]: getPosition ${result}`);
                    resolve(result);
                }
            })
        });

        return promise;
    }

    async getDuration() {
        console.log(`[${this.friendlyName}]: getDuration`);

        const obj = this;

        const promise = new Promise(function(resolve, reject) {
            obj.client.getDuration(function(err, result) {
                if(err) {
                    console.log(`[${obj.friendlyName}]: getDuration error:`);
                    console.log(err);
                    reject(err);
                } else {
                    console.log(`[${obj.friendlyName}]: getDuration ${result}`);
                    resolve(result);
                }
            })
        });

        return promise;
    }
}

// TODO Work out how to export only the things we want to export
module.exports = { Renderer };
