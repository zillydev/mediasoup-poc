const mediasoup = require('mediasoup-client');

const websocketURL = 'ws://localhost:8000/ws';

let socket, device;
let subscribeButton;

let consumerTransport;
let videoElement, audioElement;

document.addEventListener('DOMContentLoaded', async () => {
    videoElement = document.getElementById('video');
    audioElement = document.getElementById('audio');
    subscribeButton = document.getElementById('subscribeButton');
    subscribeButton.addEventListener('click', subscribe);
});

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
            case 'consumerTransport':
                onConsumerTransport(message.data);
                break;
            case 'consumed':
                onConsumed(message.data);
                break;
            default:
                break;
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed');
    };
}

const onRouterRtpCapabilities = async (routerRtpCapabilities) => {
    device = new mediasoup.Device();
    await device.load({ routerRtpCapabilities });
}

// Send a message to create a consumer transport
async function subscribe() {
    const message = {
        type: 'createConsumerTransport',
        forceTcp: false,
    }

    socket.send(JSON.stringify(message));
}

// When the consumer transport is created, connect to it, and send a message to consume the audio and video tracks
const onConsumerTransport = async (data) => {
    consumerTransport = device.createRecvTransport(data);
    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        const message = {
            type: 'connectConsumerTransport',
            transportId: consumerTransport.id,
            dtlsParameters,
        }

        socket.send(JSON.stringify(message));
        socket.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'consumerTransportConnected') {
                callback();
            }
        });
    });

    consumerTransport.on('connectionstatechange', (state) => {
        switch (state) {
            case 'connecting':
                console.log('Consumer transport connecting');
                break;
            case 'connected':
                console.log('Consumer transport connected');
                break;
            case 'failed':
                consumerTransport.close();
                console.log('Consumer transport failed');
                break;
            default:
                console.error('Consumer transport state:', state);
        }
    });

    const message = {
        type: 'consume',
        rtpCapabilities: device.rtpCapabilities,
    }
    socket.send(JSON.stringify(message));
}

// When the audio and video tracks are consumed, play them in the browser
const onConsumed = async (data) => {
    const { producerId, id, kind, rtpParameters } = data;
    const consumer = await consumerTransport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
    });

    if (kind === 'video') {
        const videoTrack = consumer.track;
        videoElement.srcObject = new MediaStream([videoTrack]);
        const message = {
            type: 'resume',
            id: consumer.id,
        }
        socket.send(JSON.stringify(message));
    } else {
        const audioTrack = consumer.track;
        audioElement.srcObject = new MediaStream([audioTrack]);
    }
    // More tracks can be consumed here, like screen sharing or additional audio tracks
}

createSocketConnection();
