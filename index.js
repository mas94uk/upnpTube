#!/bin/node

// Configuration
const DISOVERY_PERIOD = 60; // Re-scan for upnp devices every 60s
const PRUNE_PERIOD = 60;    // Check for stale renderers every 60s

const Renderer = require("./renderer").Renderer;

// Create the SSDP client
const Ssdp_Client = require('node-ssdp').Client;
const ssdp_client = new Ssdp_Client();

// The list of upnp renderers
const renderers = []
var next_index = 0;

// Handle SSDP responses
ssdp_client.on('response', function(headers, statusCode, rinfo)
{
    // Log any response with a non-200 code
    if(statusCode!=200) {
        console.log("Unexpected SSDP response {status}:");
        console.log(headers);
        console.log(rinfo);
        return;
    }

    // Get the location of the discovered renderer
    const location = headers.LOCATION;

    // Look for an existing renderer with this location
    for(let i=0 ; i<renderers.length ; ++i) {
        const renderer = renderers[i];
        if (renderer.location == location) {
            renderer.refresh();
            return;
        }
    }

    // We did not find a renderer with this location, so create one
    const renderer = new Renderer(location, next_index++);
    renderers.push(renderer);
})

function start_ssdp_discovery() {
    console.log("Doing SSDP discovery");

    // Look for renderers
    ssdp_client.search('urn:schemas-upnp-org:device:MediaRenderer:1');

    // Run again in 60s.
    setTimeout(start_ssdp_discovery, DISOVERY_PERIOD * 1000);
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

// Start the SSDP discovery, which re-rescedules itself, ensuring the program never finishes.
start_ssdp_discovery();

// TODO Listen for SSDP announcements

// Every 60s, prune any stale renderers
setInterval(pruneRenderers, PRUNE_PERIOD * 1000);
