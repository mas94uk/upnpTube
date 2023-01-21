#!/bin/node

// Configuration
const DISCOVERY_PERIOD = 600; // Re-scan for upnp devices every 10m
const PRUNE_PERIOD = 60;    // Check for stale renderers every 60s
const DEFAULT_STALE_TIMEOUT = 300;  // If the renderer does not supply its own value

const Renderer = require("./renderer").Renderer;

// Create the SSDP client
const Ssdp = require('./ssdp');
const ssdp = new Ssdp.Ssdp();

// The list of upnp renderers
const renderers = []
var next_index = 0;

// Handle SSDP responses
ssdp.on('response', function(headers, statusCode, rinfo) {
    // Log any response with a non-200 code
    if(statusCode!=200) {
        console.log("Unexpected SSDP response {status}:");
        console.log(headers);
        console.log(rinfo);
        return;
    }

    console.log('Received SSDP response');
    add_or_update_renderer(headers);
});

// Handle SSDP 'alive' notifications
ssdp.on('alive', function(values) {
    console.log("Received Alive notification")
    add_or_update_renderer(values);
});

// Handle SSDP 'byebye' notifications
ssdp.on('byebye', function(values) {
    console.log("Received Byebye notification")
    remove_renderer(values);
});

function add_or_update_renderer(values) {
    // Get the location of the discovered renderer
    const location = values.LOCATION;

    // Get the renderer's validity period, as indicated by the "CACHECONTROL" value.
    // e.g.: CACHECONTROL: 'max-age=200'
    var timeout = DEFAULT_STALE_TIMEOUT;
    if(values.CACHECONTROL) {
        const parts = values.CACHECONTROL.trim().split("=");
        if(parts.length == 2 && parts[0]=="max-age") {
            timeout = parseInt(parts[1]);
        }
    }

    // Look for an existing renderer with this location
    for(let i=0 ; i<renderers.length ; ++i) {
        const renderer = renderers[i];
        if (renderer.location == location) {
            renderer.refresh(timeout);
            return;
        }
    }

    // We did not find a renderer with this location, so create one
    const renderer = new Renderer(location, next_index++, timeout);
    renderers.push(renderer);
}

function remove_renderer(values) {
    // Note: No devices I have tested with ever seem to produce this notification,
    //       so this function is untested!

    // Get the location of the discovered renderer
    const location = values.LOCATION;

    // Look for an existing renderer with this location, and remove it
    for(let i=0 ; i<renderers.length ; ++i) {
        const renderer = renderers[i];
        if (renderer.location == location) {
            console.log("Removing disappearing renderer: " + renderer.location);
            renderers.splice(i, 1);
            return;
        }
    }
}

function pruneRenderers() {
    var pruned = false;
    do {
        pruned = false;
        for(let i=0 ; i<renderers.length ; ++i) {
            const renderer = renderers[i];

            if (renderer.isStale()) {
                console.log("Removing stale renderer: " + renderer.location);
                renderers.splice(i,i);
                pruned = true;

                // Only remove the first stale one because we have messed up the array indices.
                break;
            }
        }
    } while (pruned);
}

function start_ssdp_discovery() {
    console.log("Doing SSDP discovery");

    // Look for renderers
    ssdp.search('urn:schemas-upnp-org:device:MediaRenderer:1', 10);
}


// Start the SSDP discovery immediately
start_ssdp_discovery();

// Periodically do another SSDP discovery.
// This is not strictly necessary -- new devices should NOTIFY and we should catch it.
setInterval(start_ssdp_discovery, DISCOVERY_PERIOD * 1000);

// Listen for SSDP notifications
ssdp.start("urn:schemas-upnp-org:device:MediaRenderer:1");

// Every 60s, prune any stale renderers
setInterval(pruneRenderers, PRUNE_PERIOD * 1000);
