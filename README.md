# mediasoup-poc

## Setup

### Setup mediasoup-server

```
cd server
yarn install
yarn dev
```

### Setup client

```
cd client
```

1. Start Agora stream
2. Copy the APP_ID, TOKEN and CHANNEL values into src/config.js

```
yarn install
yarn start
```

Open one client, then click start to start the mediasoup server. Then open as many clients and click subscribe to listen to the mediasoup stream.
