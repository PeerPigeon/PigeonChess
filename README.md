# PigeonChess

P2P chess built on PeerPigeon using decentralized WebRTC mesh networking.

## Features

- 🎮 **Fully Decentralized P2P Chess** - No central server required for gameplay
- 🔐 **End-to-End Encrypted** - All moves are transmitted securely using PeerPigeon's encryption
- 🎲 **Random Color Assignment** - Fair color selection for each game
- ♟️ **Full Chess Rules** - Complete chess implementation with legal move validation
- 📜 **Game History** - Track your wins, losses, and draws locally
- ⚙️ **Configurable Signaling** - Add custom PigeonHub URIs for peer discovery
- 📱 **Responsive Design** - Chess board scales to fill viewport height
- 🌐 **WebRTC Mesh Network** - Automatic peer discovery and connection management

## Quick Start

### Prerequisites

- Node.js 18+ 
- Modern web browser with WebRTC support

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Then open `http://localhost:5173` in two different browser windows or tabs.

### Build for Production

```bash
npm run build
```

## How to Play

1. **Initialize**: Click the "Initialize" button to set up your peer connection
2. **Connect**: Click "Connect to Network" to join the PigeonChess network
3. **Find Opponent**: When another player connects, they'll appear in your peer list
4. **Challenge**: Click the "Challenge" button next to a peer to start a game
5. **Play**: Colors are randomly assigned, and the board flips for the black player
6. **Resign**: Use the resign button if you want to concede the game

## Architecture

### P2P Networking with PeerPigeon

PigeonChess uses [PeerPigeon](https://github.com/PeerPigeon/PeerPigeon) for decentralized peer-to-peer communication:

- **Signaling**: Initial peer discovery via PigeonHub (WebSocket signaling servers)
- **Transport**: Direct WebRTC DataChannels for move transmission
- **Encryption**: End-to-end encrypted messages using PeerPigeon's built-in crypto
- **DHT**: Distributed hash table for game state synchronization

### Technology Stack

- **Vue 3** - Reactive UI framework
- **TypeScript** - Type-safe development
- **PeerPigeon** - WebRTC mesh networking library
- **chess.js** - Chess game logic and validation
- **Vite** - Fast build tool and dev server

### Project Structure

```
src/
├── components/
│   ├── ChessBoard.vue      # Interactive chess board component
│   ├── GameHistory.vue     # Game history modal
│   └── SettingsModal.vue   # Settings configuration
├── composables/
│   ├── useChessGame.ts     # Chess game state management
│   ├── usePeerPigeon.ts    # P2P networking wrapper
│   └── useSettings.ts      # Persistent settings
├── types/
│   └── index.ts            # TypeScript type definitions
├── utils/
│   └── helpers.ts          # Utility functions
├── App.vue                 # Main application component
├── main.ts                 # Application entry point
└── style.css               # Global styles
```

## Configuration

### Signaling Servers

Default signaling servers:
- `wss://pigeonhub.fly.dev` (Primary, global)
- `wss://pigeonhub-server-3c044110c06f.herokuapp.com` (Secondary, US region)

You can add custom signaling servers via the Settings menu (⚙️ button).

### Network Name

The default network name is `pigeonchess`. All peers on the same network can discover each other.

## Game Protocol

### Message Types

```typescript
{
  type: 'gameStart'    // Initiate a new game
  type: 'move'         // Transmit a chess move
  type: 'resign'       // Forfeit the game
  type: 'offerDraw'    // Propose a draw
  type: 'acceptDraw'   // Accept draw offer
  type: 'rejectDraw'   // Reject draw offer
}
```

### Move Format

Moves are transmitted using Standard Algebraic Notation (SAN) via encrypted P2P messages:

```typescript
{
  type: 'move',
  gameId: 'game-1234567890',
  data: { from: 'e2', to: 'e4' }
}
```

## Storage

- **Peer ID**: Stored in localStorage for session persistence
- **Settings**: Network configuration saved locally
- **Game History**: Last 50 games stored locally (wins, losses, draws)

## Browser Support

Tested and working on:
- Chrome 89+
- Firefox 102+
- Safari 14.1+
- Edge 89+
- Brave

Requires:
- WebRTC support
- Web Cryptography API
- ES2020+
- LocalStorage

## Development

### Run Dev Server

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Deploy

PigeonChess is a static site on Cloudflare Workers, served at https://chess.peer.ooo
(see `wrangler.jsonc`). With wrangler logged in to the account that owns peer.ooo:

```bash
npm run deploy
```

## Troubleshooting

### Can't connect to peers?
- Ensure firewall allows WebRTC connections
- Try a different signaling server
- Check browser console for errors
- Verify WebRTC support in your browser

### Game not starting?
- Both players must be connected to the same network
- Accept incoming challenge notifications
- Ensure JavaScript is enabled

### Moves not syncing?
- Check internet connection
- Verify peer connection status (green = connected)
- Try refreshing and reconnecting

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © PeerPigeon Contributors

## Links

- [PeerPigeon](https://github.com/PeerPigeon/PeerPigeon) - P2P mesh networking library
- [PigeonHub](https://github.com/PeerPigeon/PigeonHub) - Signaling server
- [chess.js](https://github.com/jhlywa/chess.js) - Chess logic library

## Credits

Built with ❤️ using PeerPigeon's decentralized mesh networking technology.
