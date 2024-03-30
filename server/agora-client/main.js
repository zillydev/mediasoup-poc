const mediasoup = require('mediasoup-client');

const websocketURL = 'ws://localhost:8000/ws';

const { APP_ID, CHANNEL, TOKEN } = require('./config.js');

const client = AgoraRTC.createClient({mode:'rtc', codec:'vp8'});

let socket, device;
let videoStream, audioStream;

// Create a WebSocket connection to the server
const createSocketConnection = () => {
    socket = new WebSocket(websocketURL);

    socket.onopen = () => {
        console.log('WebSocket connection opened');
        const message = {
            type: 'getRouterRtpCapabilities',
        }

        socket.send(JSON.stringify(message));
    };

    // Handle messages from the server
    socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);

        switch (message.type) {
            case 'routerRtpCapabilities':
                onRouterRtpCapabilities(message.data);
                break;
            case 'producerTransport':
                onProducerTransport(message.data);
                break;
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed');
    };
}

// When the router RTP capabilities are received, create a device and join the channel
const onRouterRtpCapabilities = async (routerRtpCapabilities) => {
    device = new mediasoup.Device();
    await device.load({ routerRtpCapabilities });

    client.on('user-published', handleUserJoined);
    client.join(APP_ID, CHANNEL, TOKEN, null);
}

// When a user joins the channel, subscribe to their audio and video tracks, and send a message to create a producer transport
let handleUserJoined = async (user, mediaType) => {
    await client.subscribe(user, mediaType);

    if (mediaType === 'video') {
        videoStream = user.videoTrack;
    }

    if (mediaType === 'audio') {
        audioStream = user.audioTrack;
    }

    const message = {
        type: 'createProducerTransport',
        forceTcp: false,
        rtpCapabilities: device.rtpCapabilities,
    }

    socket.send(JSON.stringify(message));
}

// When the producer transport is created, connect to the transport and create producers for the audio and video tracks
const onProducerTransport = async (data) => {
    const transport = device.createSendTransport(data);
    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        const message = {
            type: 'connectProducerTransport',
            dtlsParameters,
        }

        socket.send(JSON.stringify(message));
        socket.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'producerTransportConnected') {
                callback();
            }
        });
    });

    transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        const message = {
            type: 'produce',
            kind,
            rtpParameters,
        }

        socket.send(JSON.stringify(message));
        socket.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'produced') {
                callback({ id: message.id });
            }
        });
    });

    transport.on('connectionstatechange', (state) => {
        switch (state) {
            case 'connecting':
                console.log('Producer transport connecting');
                break;
            case 'connected':
                console.log('Producer transport connected');
                break;
            case 'failed':
                transport.close();
                console.log('Producer transport failed');
                break;
            default:
                console.error('Producer transport state:', state);
        }
    });

    try {
        await transport.produce({ track: videoStream.getMediaStreamTrack() });
        await transport.produce({ track: audioStream.getMediaStreamTrack() });
        // More tracks can be produced here, like screen sharing
    } catch (error) {
        console.error('Error while creating producer:', error);
    }
}

createSocketConnection();