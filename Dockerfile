FROM alpine:3.17

RUN apk add --no-cache \
    git \
    npm \
    yt-dlp

RUN git clone https://github.com/mas94uk/upnpTube /tmp/upnpTube \
    && cd /tmp/upnpTube \
    && npm ci \
    && npm link

ENTRYPOINT [ "node", "/usr/local/bin/upnpTube" ]
