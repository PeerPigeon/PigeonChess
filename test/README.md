# Test Guide

## Vector Clock Timer Sync Test

This test verifies that the vector clock implementation correctly synchronizes game timers between two P2P players.

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. The test requires the dev server to be running on `http://localhost:5173`

### Running the Test

1. **Start the dev server** in one terminal:
   ```bash
   npm run dev
   ```

2. **Run the test** in another terminal:
   ```bash
   npm run test:e2e
   ```
### E2E environment overrides

The E2E runner starts a local Vite dev server and then runs the Puppeteer test.

- `BASE_URL`: URL Puppeteer should load (default `http://localhost:5173`)
- `E2E_SIGNALING_URL`: force both players to use a single signaling server URL
- `E2E_SIGNALING_URL_P1`: Player 1 signaling server (default `wss://pigeonhub-b.fly.dev`)
- `E2E_SIGNALING_URL_P2`: Player 2 signaling server (default `wss://pigeonhub-c.fly.dev`)
- `E2E_NETWORK_NAME`: network namespace (default `pigeonchess`)
- `E2E_DISABLE_SOUND`: set to `false` to enable sound (default `true`)

### What the Test Does

The test automates the following scenario:

1. **Launch Two Browsers** - Opens two Puppeteer browser instances (Player 1 and Player 2)

2. **Connect to P2P Network** - Both players connect to the PeerPigeon mesh network

3. **Start Matchmaking** - Both select "Bullet 1+0" time control and search for a game

4. **Play Test Game** - Executes a sequence of chess moves:
   - e2-e4 (White)
   - e7-e5 (Black)
   - g1-f3 (White)
   - b8-c6 (Black)

5. **Verify Timer Sync** - Checks that:
   - Player 1's "my time" matches Player 2's "opponent time"
   - Player 1's "opponent time" matches Player 2's "my time"
   - Timers are within 3 seconds of each other (accounting for network latency)

6. **Verify Vector Clock** - Confirms vector clock implementation is present

### Test Configuration

Edit `test/vector-clock-test.ts` to customize:

```typescript
const DEV_URL = 'http://localhost:5173'; // Dev server URL
const SEARCH_DELAY = 2000;  // Wait time for matchmaking (ms)
const MOVE_DELAY = 1500;    // Delay between moves (ms)
const TIMER_SYNC_WAIT = 5000; // Wait for timer sync messages (ms)
```

### Headless Mode

For CI/CD pipelines, change in `test/vector-clock-test.ts`:

```typescript
headless: false  // Change to true for headless mode
```

### Expected Output

```
🧪 PigeonChess Vector Clock Timer Test

🚀 Launching browsers...
📱 Loading application...
✅ Browsers ready
🔗 Waiting for P2P connections...
✅ P2P Connected: 👥 1 peer online 👥 1 peer online
🔍 Starting matchmaking...
⏳ Waiting for match...
✅ Game started successfully
🎮 Playing test game...
♟️  Player 1 making move: e2 -> e4
  After e2-e4: { player1: { myTime: '0:59', opponentTime: '1:00' }, ... }
♟️  Player 2 making move: e7 -> e5
...
⏱️  Verifying timer synchronization...
  Time diff: 1s (0:58 vs 0:59)
  Time diff: 0s (1:00 vs 1:00)
✅ Timer synchronization verified
🕐 Verifying vector clock implementation...
✅ Vector clock implementation detected
🧹 Cleaning up...
✅ Cleanup complete

============================================================
📊 Test Summary
============================================================
✅ Test 1: Both players connected to P2P network
✅ Test 2: Match found and game started
✅ Test 3: Test game completed successfully
✅ Test 4: Timers are synchronized within acceptable range
✅ Test 5: Vector clock is implemented
============================================================
📈 Results: 5/5 tests passed
============================================================
```

### Troubleshooting

**Browsers don't launch:**
- Ensure Puppeteer is installed: `npm install --save-dev puppeteer`
- On Linux, you may need additional dependencies

**Connection timeout:**
- Check that signaling servers are accessible
- Increase `timeout` in `waitForFunction` calls

**Match not starting:**
- Ensure both peers can discover each other
- Check browser console logs for errors
- Increase `SEARCH_DELAY`

**Timer sync fails:**
- Network latency may be high - increase acceptable time difference
- Check that `timer_sync` messages are being sent (check console logs)
- Verify vector clock is incrementing

### Manual Testing

You can also test manually:

1. Start dev server: `npm run dev`
2. Open `http://localhost:5173` in two browser windows
3. Select same time control in both
4. Click "Search for Game" in both
5. Play some moves
6. Watch the timers - they should stay synchronized within ~2-3 seconds
