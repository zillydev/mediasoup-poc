const mediasoup = require('mediasoup-client');

const DEVICE_IP = require('./config');

const websocketURL = `ws://${DEVICE_IP}:8000/ws`;

const userId = crypto.randomUUID();

let socket, device;
let subscribeButton;

let consumers = [];
let recvTransport;

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
            case 'getRouterRtpCapabilities':
                getRouterRtpCapabilities(message.data);
                break;
            case 'createConsumerTransport':
                createConsumerTransport(message.data);
                break;
            case 'consumeProducer':
                consumeProducer(message.data);
                break;
            case 'producerCreated':
                onProducerCreated(message.data);
                break;
            case 'producerPaused':
                onProducerPaused(message.data);
                break;
            case 'producerResumed':
                onProducerResumed(message.data);
                break;
            default:
                break;
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed');
    };
}

const getRouterRtpCapabilities = async (routerRtpCapabilities) => {
    device = new mediasoup.Device();
    await device.load({ routerRtpCapabilities });
}

// Send a message to create a consumer transport
async function subscribe() {
    const message = {
        type: 'createConsumerTransport',
        userId,
        forceTcp: false,
    }
    socket.send(JSON.stringify(message));
}

// When the consumer transport is created, connect to it, and send a message to consume the audio and video tracks
const createConsumerTransport = async (data) => {
    recvTransport = device.createRecvTransport(data);
    recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        const message = {
            type: 'connectConsumerTransport',
            userId,
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

    recvTransport.on('connectionstatechange', (state) => {
        switch (state) {
            case 'connecting':
                console.log('Consumer transport connecting');
                break;
            case 'connected':
                console.log('Consumer transport connected');
                break;
            case 'failed':
                recvTransport.close();
                console.log('Consumer transport failed');
                break;
            default:
                console.error('Consumer transport state:', state);
        }
    });

    const message = {
        type: 'consumeAllProducers',
        userId,
        rtpCapabilities: device.rtpCapabilities,
    }
    socket.send(JSON.stringify(message));
}

// When the audio and video tracks are consumed, play them in the browser
const consumeProducer = async (data) => {
    const { producerUserId, producerId, id, kind, rtpParameters } = data;
    const consumer = await recvTransport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
    });
    consumers.push(consumer);

    consumer.on('transportclose', () => {
        const message = {
            type: 'closeConsumerTransport',
            id: recvTransport.id
        }
        socket.send(JSON.stringify(message));
    });
    
    let cont = document.getElementById(producerUserId);
    if (cont === null) {
        cont = document.createElement('div');
        cont.id = producerUserId;
    }
    if (kind === 'video') {
        const videoTrack = consumer.track;
        // videoElement.srcObject = new MediaStream([videoTrack]);
        let video = document.createElement('video');
        video.id = consumer.id;
        video.srcObject = new MediaStream([videoTrack]);
        video.autoplay = true;
        video.playsinline = true;
        cont.appendChild(video);
        const message = {
            type: 'resumeConsumer',
            id: consumer.id,
            userId
        }
        socket.send(JSON.stringify(message));
    } else {
        const audioTrack = consumer.track;
        // audioElement.srcObject = new MediaStream([audioTrack]);
        let audio = document.createElement('audio');
        audio.id = consumer.id;
        audio.srcObject = new MediaStream([audioTrack]);
        audio.autoplay = true;
        audio.playsinline = true;
        cont.appendChild(audio);
    }
    document.getElementById('videos').appendChild(cont);
    // More tracks can be consumed here, like screen sharing or additional audio tracks
}

const onProducerCreated = (data) => {
    const message = {
        type: 'consumeProducer',
        userId,
        producerUserId: data.producerUserId,
        producerId: data.producerId,
        rtpCapabilities: device.rtpCapabilities,
    }
    socket.send(JSON.stringify(message));
}

const onProducerPaused = (data) => {
    if (consumers.find(c => c.id === data)) {
        document.getElementById(data).srcObject = null;
    }
}

const onProducerResumed = (data) => {
    let consumer = consumers.find(c => c.id === data);
    if (consumer) {
        document.getElementById(data).srcObject = new MediaStream([consumer.track]);
    }
}

createSocketConnection();

// Close the receive transport when the window is closed
window.onunload = () => {
    // Triggers a "transportclose" event in all its producers and consumers
    recvTransport.close();
}
