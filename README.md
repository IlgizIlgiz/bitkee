# BitKeys

BitKeys is a tool for exploring the Bitcoin private key space. It generates Bitcoin addresses from private keys and checks their balances via the Blockchain.info API.

## Features

- **Manual Mode**: Navigate through pages of 128 addresses, select specific pages or positions
- **Auto Mode**: Automatically scan random pages until a balance is found
- **Puzzle Mode**: Search for keys to Bitcoin Puzzle addresses with real rewards
- **History**: All found addresses with balance or transaction history are saved locally
- **Multilingual**: English and Russian interface

## Getting Started

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view in browser.

## Build

```bash
npm run build
```

## Security

The app runs entirely in your browser. Private keys are generated locally and never sent to any server.

## Disclaimer

This project is for educational purposes only. Never spend bitcoins you find — they may belong to someone else.

## Community

Join our Telegram: [@bitkeysapp](https://t.me/bitkeysapp)
