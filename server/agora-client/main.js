const mediasoup = require('mediasoup-client');

const websocketURL = 'ws://localhost:8000/ws';

const { APP_ID, CHANNEL, TOKEN } = require('./config.js');

const client = AgoraRTC.createClient({mode:'rtc', codec:'vp8'});

let numberOfProducers = 0;

let socket, device;
let sendTransport;

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
            case 'createProducerTransport':
                createProducerTransport(message.data);
                break;
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed');
    };
}

// When the router RTP capabilities are received
const getRouterRtpCapabilities = async (routerRtpCapabilities) => {
    // Create a device and load it with the router RTP capabilities
    device = new mediasoup.Device();
    await device.load({ routerRtpCapabilities });

    // Send a message to the server to create a producer transport
    const message = {
        type: 'createProducerTransport',
        forceTcp: false,
        rtpCapabilities: device.rtpCapabilities,
    }
    socket.send(JSON.stringify(message));
}

// let handleUserJoined = (user) => {}
// let handleUserLeft = (user, reason) => {}

// When a user publishes a track
let handleUserTrackPublished = async (user, mediaType) => {
    // Subscribe to the user's published track
    await client.subscribe(user, mediaType);
    let subscriptionsArray = client._p2pChannel.store.state.keyMetrics.subscribe;
    
    // Create a local producer for the subscribed track
    let producerId = crypto.randomUUID();
    await sendTransport.produce({ 
        id: producerId, 
        track: user[`${mediaType}Track`].getMediaStreamTrack(), 
        appData: { producerId, userId: user.uid}
    });

    let index = subscriptionsArray.findIndex(obj => obj.userId === user.uid && obj.type === mediaType);
    subscriptionsArray[index]['producerId'] = producerId;
    // console.log(client);
}

// When a user unpublishes a track
let handleUserTrackUnpublished = async (user, mediaType) => {
    console.log(client._p2pChannel);
    let obj = subscriptionsArray.find(obj => obj.userId === user.uid && obj.type === mediaType);
    await client.unsubscribe(user, mediaType);
    const message = {
        type: 'pauseProducer',
        producerUserId: user.uid,
        producerId: obj.producerId
    }
    socket.send(JSON.stringify(message));
}

// When the producer transport is created
const createProducerTransport = async (transportParams) => {
    // Create a local producer transport
    sendTransport = device.createSendTransport(transportParams);

    // When the local transport connects
    sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        // Send a message to the server to connect the corresponding server-side producer transport
        const message = {
            type: 'connectProducerTransport',
            dtlsParameters,
        }
        socket.send(JSON.stringify(message));

        // When the local transport and the corresponding server-side transport are connected
        socket.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'producerTransportConnected') {
                callback();
            }
        });
    });

    // When the local transport produces a track
    sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        // Send a message to the server to create a corresponding server-side producer
        const message = {
            type: 'createProducer',
            id: appData.producerId,
            userId: appData.userId,
            kind,
            rtpParameters
        }
        socket.send(JSON.stringify(message));

        // When the server-side producer is created
        socket.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'producerCreated') {
                callback({ id: message.producerId });
            }
        });
    });

    sendTransport.on('connectionstatechange', (state) => {
        switch (state) {
            case 'connecting':
                console.log('Producer transport connecting');
                break;
            case 'connected':
                console.log('Producer transport connected');
                break;
            case 'failed':
                sendTransport.close();
                console.log('Producer transport failed');
                break;
            default:
                console.error('Producer transport state:', state);
        }
    });

    // client.on('user-joined', handleUserJoined);
    // client.on('user-left', handleUserLeft);
    client.on('user-published', handleUserTrackPublished);
    client.on('user-unpublished', handleUserTrackUnpublished);
    client.join(APP_ID, CHANNEL, TOKEN, null);
}

createSocketConnection();

// Close the producer transport and leave the channel when the window is closed
window.onunload = () => {
    client.leave();
    // Triggers a "transportclose" event in all its producers and consumers
    sendTransport.close();
    socket.send(JSON.stringify({ type: 'closeProducerTransport', id: sendTransport.id}));
}