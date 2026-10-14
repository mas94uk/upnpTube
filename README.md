# upnpTube
Cast from YouTube app to DLNA/UPNP renderers.

Run upnpTube on a machine on your local network. It finds all UPnP / DLNA renderers (Wifi speakers, amplifiers, smart TVs etc.) and lets you cast to them from the Android/iPhone YouTube apps.

The YouTube app can be used to play, pause, stop and control the volume of the player.


## Installation

### Local installation
Install npm and node.js:

    sudo apt install npm
    
Install upnpTube:

    mkdir upnpTube
    cd upnpTube
    npm install https://github.com/mas94uk/upnpTube
    sudo npm link
    
Install yt-dlp:

    sudo apt install yt-dlp

Run it:

    upnpTube
    

### Installation using Docker
Clone this repository:

    git clone git@github.com:mas94uk/upnpTube.git

Create and start the Docker image:

    cd upnpTube
    docker-compose up [--detach]

### How it works
upnpTube scans for DLNA/UPNP renderers on your network. For each one it finds, it creates a YouTube Cast Receiver, named after the renderer.
When a YouTube Cast Receiver receives a cast, it uses yt-dlp to find an audio-only stream, which it proxies (since it will be available as HTTPS and most renderers support only HTTP). It instructs the renderer to play the proxied stream.


### Limitations

Seeking does not work. I have not done much investigation into why.
