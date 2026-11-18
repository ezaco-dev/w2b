# w2b

WhatsApp Bot Helper using [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys).

A simple and lightweight wrapper to create WhatsApp bots easily.

## Installation

```bash
npm install w2b
```

## Features
- Easy setup and routing
- Simple event handling
- Built-in placeholder functions
- Straightforward action methods for sending text, images, videos, documents, etc.

## Usage

```javascript
import { Setup, Route, Run, Text } from 'w2b';

// Initialize the bot
Setup({
    // configuration options
});

// Create a route for a command
Route('ping', async () => {
    await Text('pong!');
});

// Run the bot
Run();
```

## Exports

- **Core Lifecycle**: `Setup`, `Run`, `Reload`, `Event`
- **Routing**: `Route`, `Include`
- **Actions**: `Text`, `Image`, `Video`, `Document`, `Audio`, `Sticker`, `Poll`, `Location`, `Delete`, `Ban`
- **Helpers**: `GetUsrId`, `Mention`, `Arg`, `GetMedia`
- **Context**: `executionContext`

## License

MIT
