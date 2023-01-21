// SSDP discovery
// (The "node-ssdp" module does not receive notifications outside of a search)

const dgram = require('dgram'); // dgram is UDP
const EventEmitter = require( 'events' );

class Ssdp extends EventEmitter {
    /**
     * Start listening for notifications
     * @param {String} nt Notification type to report (e.g. 'urn:schemas-upnp-org:device:MediaRenderer:1'); or null to report all 
    **/
    start(nt=null) {
        // Stop any previous listener
        this.stop();

        // Prepare the UDP socket to receive broadcast notifications.
        this.notification_socket = dgram.createSocket({
            type: "udp4",
            reuseAddr: true
        });
        this.notification_socket.on('listening', () => {
            this.notification_socket.addMembership('239.255.255.250');
        });
        this.notification_socket.on('message', (message, rinfo) => {
            this._notification_message(message, rinfo, nt);
        });
        this.notification_socket.bind(1900);
    }

    /**
     * Issue an M-SEARCH, to cause devices to respond.
     * @param {String} st Search type, e.g. 'urn:schemas-upnp-org:device:MediaRenderer:1'
     * @param {number} mx Maximum search duration, in seconds
     */
    search(st='upnp:rootdevice', mx=3) {
        if (! this.search_socket) {
            // Create the socket
            this.search_socket = dgram.createSocket('udp4');
            this.search_socket.on('message', (message, rinfo) => {
                this._search_message(message, rinfo);
            });
    
            // Listen for responses. Any port is fine.
            this.search_socket.bind();
        }

        // Prepare the M-SEARCH message
        const search = new Buffer.from([
            'M-SEARCH * HTTP/1.1',
            'HOST: 239.255.255.250:1900',
            'MAN: "ssdp:discover"',
            `MX: ${mx}`,
            `ST: ${st}`,
            '',''  // Need 2 line endings at end of buffer. 
        ].join('\r\n'));
        
        // Send it
        this.search_socket.send(search, 0, search.length, 1900, "239.255.255.250");
    }

    /**
     * Stop listening for notifications
     **/
    stop() {
        if(this.notification_socket) {
            this.notification_socket.close();
            this.notification_socket = null;
        }
    }

    // Parse lines in the format
    //  key: value
    // into an object 
    static _get_values(lines) {
        const values = [];
        // Break the remaining lines into key:value pairs
        for (const line of lines) {
            // Split the line on the first colon
            let [key, ...value] = line.split(':');

            // The first part is the key. Remove any non-letter characters and make upper case
            key = key.trim().toUpperCase().replace(/[^A-Z]/g, '');
            // The rest is the value
            value = value.join(':').trim();
            if (key.length > 0 ) values[key] = value;
        }
        return values;
    }

    // Process a search result message
    _search_message(message, rinfo) {
        console.log("ssdp: Got search response");

        // A typical search response looks like this:
        //  HTTP/1.1 200 OK
        //  Location: http://192.168.1.15:51161/93b2abac-cb6a-4857-b891-0019f584ab70.xml
        //  Ext:
        //  USN: uuid:93b2abac-cb6a-4857-b891-0019f584ab70::urn:schemas-upnp-org:device:MediaRenderer:1
        //  Server: Linux/3.3.0 UPnP/1.0 GUPnP/0.18.2
        //  Cache-Control: max-age=200
        //  ST: urn:schemas-upnp-org:device:MediaRenderer:1
        //  Date: Fri, 02 Jan 1970 09:36:46 GMT
        //  Content-Length: 0
        
        // Split the message into lines
        // console.log(typeof(message));
        const lines = message.toString().split('\n');

        // The first line should contain the status
        const parts = lines[0].trim().split(' ');
        const http_status = parseInt(parts[1]);

        // Parse the keys and values in the remaining lines
        const values = Ssdp._get_values(lines.slice(1));

        // Emit the result
        console.log("ssdp: Emitting search response");
        this.emit("response", values, http_status, rinfo);
    }

    // Process a notification message
    _notification_message(message, rinfo, nt) {
        // console.log("ssdp: Got notification");

        // A typical notification looks like this:
        //  NOTIFY * HTTP/1.1
        //  Host: 239.255.255.250:1900
        //  Cache-Control: max-age=200
        //  Location: http://192.168.1.15:51161/93b2abac-cb6a-4857-b891-0019f584ab70.xml
        //  Server: Linux/3.3.0 UPnP/1.0 GUPnP/0.18.2
        //  NTS: ssdp:alive
        //  NT: urn:schemas-upnp-org:device:MediaRenderer:1
        //  USN: uuid:93b2abac-cb6a-4857-b891-0019f584ab70::urn:schemas-upnp-org:device:MediaRenderer:1
        
        // Split the message into lines
        // console.log(typeof(message));
        const lines = message.toString().split('\n');

        // The first line contains the message type - typically "NOTIFY" or "M-SEARCH"
        const message_type = lines[0].trim().toUpperCase();
        
        // We only care about NOTIFY messages
        if (! message_type.startsWith("NOTIFY")) {
            return;
        }

        // Parse the keys and values in the remaining lines
        const values = Ssdp._get_values(lines.slice(1));
        // console.log(values);

        // If a NT filter was specified, check the result contains it
        if(nt) {
            if ( (! values.NT ) || (! values.NT.includes(nt) )) {
                // console.log("Unsuitable NT -- ignoring");
                return;
            }
        }

        // If NTS is "ssdp:alive", emit an "ALIVE"
        if(values.NTS.includes("ssdp:alive")) {
            console.log("ssdp: Emitting alive");
            this.emit("alive", values);
        } else if(values.NTS.includes("ssdp:byebye")) {
            console.log("ssdp: Emitting byebye");
            this.emit("byebye", values);
        } else {
            console.log(`Unexpected notification type: ${values.NTS}`);
        }

        // Always emit a NOTIFY
        console.log("ssdp: Emitting notify");
        this.emit("notify", values);
    }
}

module.exports = { Ssdp };
