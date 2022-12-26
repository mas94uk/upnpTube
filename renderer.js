const { Console } = require('console');
const MediaRendererClient = require('upnp-mediarenderer-client');

// TODO: Ideally the author will accept the pull request and re-publish. Otherwise tie it to my fork.
const Ytcr = require('../yt-cast-receiver_mas94');

// Use ports 3000, 3001, 3002 etc for successive YTCRs
const YTCR_BASE_PORT = 3000;

/**
 * Class controlling a single upnp media renderer.
 * It implements yt-cast-receiver.Player so that it can receive and translate casts from YouTube.
 */
class Renderer extends Ytcr.Player {
    STALE_TIMEOUT = 300;  // A upnp renderer which has not been seen for 300s is considered to have disappeared

    constructor(location, index)
    {
        // Call the Ytcr.Player constructor
        super();

        console.log("Creating new renderer: " + location);
        this.location = location;
        this.index = index;
        this.refresh();

        // Instantiate the mediarender client
        this.client = new MediaRendererClient(location);

        // No errors so far
        this.error = false

        // Get device details
        const obj = this;
        this.client.getDeviceDescription(function(err, description) {
            if(err) {
                console.log("Failed to get device description from " + this.location);
                return;
            }

            // Create a friendly string from the above, which we will name the YouTube cast receiver
            // e.g. "Living Room (Pure Jongo A2)"
            const friendlyName = description.friendlyName;
            const manufacturer = description.manufacturer;
            const modelName = description.modelName;
            obj.friendlyName = friendlyName + " (" + manufacturer + " " + modelName + ")";
            console.log(obj.friendlyName);

            // Create a youtube cast receiver
            const options = {port: YTCR_BASE_PORT + obj.index,
                             friendlyName: obj.friendlyName,
                             manufacturer: obj.manufacturer,
                             modelName: obj.modelName}; 
            obj.ytcr = Ytcr.instance(obj, options);
            obj.ytcr.start();
        })
    }

    refresh() {
        this.lastSeenTime = Number(process.hrtime.bigint() / 1000000000n);
        console.log("Refreshed renderer " + this.location + " to " + this.lastSeenTime);
    }

    isStale() {
        // If an error occurred in setup, we are stale. The program will delete us and recreate.e
        if (this.error) return true;

        // If we have not been refreshed (i.e. discovered again) in STALE_TIMEOUT, we are stale.
        const now = Number(process.hrtime.bigint()  / 1000000000n);
        if (this.lastSeenTime + this.STALE_TIMEOUT < now) return true;

        return false;
    }

    /**
     * The methods implementing yt-cast-receiver.Player
     */
    async play(videoId, position = 0) {
        console.log(`[${this.friendlyName}]: Play ${videoId} at position ${position}s`);
        // TODO Implement
        await this.notifyPlayed();
    }

    async pause() {
        console.log(`[${this.friendlyName}]: Pause`);
        // TODO Implement
        await this.notifyPaused();
    }

    async resume() {
        console.log(`[${this.friendlyName}]: Resume`);
        // TODO Implement
        await this.notifyResumed();
    }

    async stop() {
        console.log(`[${this.friendlyName}]: Stop`);
        // TODO Implement
        await this.notifyStopped();
    }

    async seek(position, statusBeforeSeek) {
        console.log(`[${this.friendlyName}]: Seek to ${position}s`);
        // TODO Implement
        await this.notifySeeked(statusBeforeSeek);
    }

    async getVolume() {
        console.log(`[${this.friendlyName}]: getVolume`);
        // TODO Implement
        return 50;
    }

    async setVolume(volume) {
        console.log(`[${this.friendlyName}]: setVolume to ${volume}`);
        // TODO Implement
        await this.notifyVolumeChanged();
    }

    async getPosition() {
        console.log(`[${this.friendlyName}]: getPosition`);
        // TODO Implement
        return 123;
    }

    async getDuration() {
        console.log(`[${this.friendlyName}]: getDuration`);
        // TODO Implement
        return 456;
    }

}

// TODO Work out how to export only the things we want to export
module.exports = { Renderer };
