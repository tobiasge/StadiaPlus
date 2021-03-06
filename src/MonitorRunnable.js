const MonitorRunnable = function () {
    this.enabled = false;
    this.peerConnections = [];
    this.originalRTC;
    this.startTime;
    this.element;
    this.editable = false;
    this.x = 0;
    this.y = 0;

    const self = this;
    this.originalRTC = RTCPeerConnection;
    (function (OriginalRTCConnection) {
        self.originalRTC = OriginalRTCConnection;

        RTCPeerConnection = function (args) {
            const connection = new OriginalRTCConnection(args);
            self.peerConnections.push(connection);
            return connection;
        };
        RTCPeerConnection.prototype = OriginalRTCConnection.prototype;
    })(RTCPeerConnection);

    this.start = function () {
        this.enabled = true;
        this.element = document.createElement('div');
        this.element.classList.add('stadiaplus_networkmonitor');
        this.element.id =
            'networkmonitor-' + Math.floor(Math.random() * 999999);
        document.body.appendChild(this.element);

        this.setEditable(true);
        this.updatePosition();
        this.update();
    };

    this.setPosition = function (x, y) {
        this.x = x;
        this.y = y;
        this.updatePosition();
    };

    this.updatePosition = function () {
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';

        const corners = {
            tl: 10,
            tr: 10,
            bl: 10,
            br: 10,
        };

        if (this.x < 10) {
            corners.tl = 0;
            corners.bl = 0;
        }

        if (this.y < 10) {
            corners.tl = 0;
            corners.tr = 0;
        }

        if (this.x > window.innerWidth - this.element.clientWidth - 10) {
            corners.tr = 0;
            corners.br = 0;
        }

        if (this.y > window.innerHeight - this.element.clientHeight - 10) {
            corners.bl = 0;
            corners.br = 0;
        }

        this.element.style[
            'border-radius'
        ] = `${corners.tl}px ${corners.tr}px ${corners.br}px ${corners.bl}px`;
    };

    this.mouseEvents = [];
    this.moving = false;
    this.offset = { x: 0, y: 0 };
    this.setEditable = function (editable) {
        this.editable = editable;
        this.element.classList.toggle('editable', editable);

        if (editable) {
            this.mouseEvents.push(
                {
                    target: document,
                    type: 'mousemove',
                    fn: (event) => {
                        if (this.moving) {
                            this.x = Math.max(
                                0, // Minimum x value
                                Math.min(
                                    window.innerWidth -
                                        this.element.clientWidth, // Maximum x value
                                    event.clientX - this.offset.x,
                                ),
                            );
                            this.y = Math.max(
                                0, // Minimum y value
                                Math.min(
                                    window.innerHeight -
                                        this.element.clientHeight, // Maximum y value
                                    event.clientY - this.offset.y,
                                ),
                            );

                            this.updatePosition();
                        }
                    },
                },
                {
                    target: this.element,
                    type: 'mousedown',
                    fn: (event) => {
                        this.moving = true;
                        this.offset.x = event.clientX - this.x;
                        this.offset.y = event.clientY - this.y;
                    },
                },
                {
                    target: document,
                    type: 'mouseup',
                    fn: (event) => {
                        this.moving = false;
                    },
                },
            );
            this.mouseEvents.forEach((event) =>
                event.target.addEventListener(event.type, event.fn),
            );
        } else {
            this.mouseEvents.forEach((event) =>
                event.target.removeEventListener(event.type, event.fn),
            );
        }
    };

    this.setVisible = function (visible) {
        this.visible = visible;
    };

    this.stop = function () {
        this.enabled = false;
        this.setEditable(false);
        this.element.remove();

        RTCPeerConnection = this.originalRTC;
        peerConnections = [];
    };

    this.visible = {
        time: true,
        resolution: true,
        FPS: true,
        latency: true,
        codec: true,
        traffic: true,
        'current-traffic': true,
        'average-traffic': true,
        'packets-lost': true,
        'average-packet-loss': true,
        'jitter-buffer': true,
    };

    this.stats = [];
    this.update = function () {
        if (this.peerConnections.length > 1) {
            const index = this.peerConnections.length - 1;

            this.peerConnections[index].getStats().then((_stats) => {
                this.stats = Array.from(_stats);

                const RTCInboundRTPVideoStream = this.getStat((stat) =>
                    stat[0].startsWith('RTCInboundRTPVideoStream'),
                );
                const RTCIceCandidatePair = this.getStat((stat) =>
                    stat[0].startsWith('RTCIceCandidatePair'),
                );
                const RTCMediaStreamTrack_receiver = this.getStat(
                    (stat) =>
                        stat[0].startsWith('RTCMediaStreamTrack_receiver') &&
                        stat[1].kind === 'video',
                );

                const resolution = this.getResolution(
                    RTCMediaStreamTrack_receiver,
                );
                const fps = this.getFPS(RTCInboundRTPVideoStream);
                const latency = this.getLatency(RTCIceCandidatePair) + ' ms';
                const codec = this.getCodec(RTCInboundRTPVideoStream);
                const totalTraffic = this.translateBitUnits(
                    this.getTotalDownload(RTCIceCandidatePair),
                );
                const currentTraffic =
                    this.translateBitUnits(
                        this.getDownloadSpeed(RTCIceCandidatePair),
                    ) + '/s';
                const averageTraffic =
                    this.translateBitUnits(
                        this.getAverageDownloadSpeed(RTCIceCandidatePair),
                    ) + '/s';
                const packetsLost = this.getPacketsLost(
                    RTCInboundRTPVideoStream,
                );
                const averagePacketLoss =
                    this.getAveragePacketLoss(RTCInboundRTPVideoStream) + '%';
                const jitterBuffer =
                    this.getJitterBuffer(RTCMediaStreamTrack_receiver) + ' ms';

                let html = '';
                if (this.visible['time']) {
                    let time = new Date();
                    let timeString = time.toLocaleString();
                    html += `<h5>${timeString}</h5>`;
                }

                html += '<ul>';
                if (this.visible['resolution']) {
                    html += `<li>Resolution: ${resolution.width}x${resolution.height}</li>`;
                }

                if (this.visible['FPS']) {
                    html += `<li>FPS: ${fps}</li>`;
                }

                if (this.visible['latency']) {
                    html += `<li>Latency: ${latency}</li>`;
                }

                if (this.visible['codec']) {
                    html += `<li>Codec: ${codec}</li>`;
                }

                if (this.visible['traffic']) {
                    html += `<li>Total Traffic: ${totalTraffic}</li>`;
                }

                if (this.visible['current-traffic']) {
                    html += `<li>Current Traffic: ${currentTraffic}</li>`;
                }

                if (this.visible['average-traffic']) {
                    html += `<li>Average Traffic: ${averageTraffic}</li>`;
                }

                if (this.visible['packets-lost']) {
                    html += `<li>Packets Lost: ${packetsLost}</li>`;
                }

                if (this.visible['average-packet-loss']) {
                    html += `<li>Average Packet Loss: ${averagePacketLoss}</li>`;
                }

                if (this.visible['jitter-buffer']) {
                    html += `<li>Jitter Buffer: ${jitterBuffer}</li>`;
                }

                html += '</ul>';

                this.element.innerHTML = html;
            });
        } else {
            this.startTime = Date.now();
            this.element.innerHTML = `
                <h5>Error</h5>
                <p>
                    Uh oh, something went terribly wrong. 
                    This feature is still very unstable and 
                    the developer knows there are problems, 
                    please understand that this issue is 
                    actively being worked on.
                </p>
                <p class='stadiaplus_muted'>Error Code: 001 - Stats unavailable</p>
            `;
        }

        if (this.enabled) {
            setTimeout(() => {
                this.update();
            }, 1000);
        }
    };

    this.getStat = function (filter) {
        return this.stats.find(filter)[1];
    };

    this.translateBitUnits = function (value) {
        const units = ['b', 'kb', 'Mb', 'Gb'];

        let i = 0;
        while (value / 1000 >= 1) {
            i++;
            value /= 1000;
        }

        return (
            value.toPrecision(4) + ' ' + units[Math.min(units.length - 1, i)]
        );
    };

    this.getLatency = function (RTCIceCandidatePair) {
        return RTCIceCandidatePair.currentRoundTripTime * 1000;
    };

    this.getJitterBuffer = function (RTCMediaStreamTrack_receiver) {
        return (
            (RTCMediaStreamTrack_receiver.jitterBufferDelay * 1000) /
            RTCMediaStreamTrack_receiver.jitterBufferEmittedCount
        ).toPrecision(4);
    };

    this.getPacketsLost = function (RTCInboundRTPVideoStream) {
        return RTCInboundRTPVideoStream.packetsLost;
    };

    this.getAveragePacketLoss = function (RTCInboundRTPVideoStream) {
        return (
            (RTCInboundRTPVideoStream.packetsLost /
                (RTCInboundRTPVideoStream.packetsReceived +
                    RTCInboundRTPVideoStream.packetsLost)) *
            100
        ).toPrecision(2);
    };

    this.lastDownload = 0;
    this.getDownloadSpeed = function (RTCIceCandidatePair) {
        const download = this.getTotalDownload(RTCIceCandidatePair);
        const speed = download - this.lastDownload;
        this.lastDownload = download;
        return speed;
    };

    this.getAverageDownloadSpeed = function (RTCIceCandidatePair) {
        return (
            this.getTotalDownload(RTCIceCandidatePair) /
            (this.timeSinceStart() / 1000)
        );
    };

    this.getTotalDownload = function (RTCIceCandidatePair) {
        return RTCIceCandidatePair.bytesReceived * 8;
    };

    this.getResolution = function (RTCMediaStreamTrack_receiver) {
        return {
            width: RTCMediaStreamTrack_receiver.frameWidth,
            height: RTCMediaStreamTrack_receiver.frameHeight,
        };
    };

    this.getCodec = function (RTCInboundRTPVideoStream) {
        const codecStat = this.getStat(
            (stat) => stat[0] === RTCInboundRTPVideoStream.codecId,
        );
        return codecStat.mimeType.substring('video/'.length);
    };

    this.lastFrames = 0;
    this.getFPS = function (RTCInboundRTPVideoStream) {
        const fps = RTCInboundRTPVideoStream.framesDecoded - this.lastFrames;
        this.lastFrames = RTCInboundRTPVideoStream.framesDecoded;
        return fps;
    };

    this.timeSinceStart = function () {
        return Date.now() - this.startTime;
    };
};

StadiaPlusMonitor = new MonitorRunnable();
