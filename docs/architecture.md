# PigeonChess architecture

## Overview

```mermaid
flowchart TB
  pages["`**Player pages on chess.peer.ooo**
    Each page runs a game node and a PigeonAI node (PeerPigeon)
    Phones, tablets and computers; a page with a GPU holds a share of the model`"]
  relays["`**Relays (FreeRTC)**
    peer.ooo Workers, or your own
    Signaling only: introduce peers
    No game or model data`"]
  links["`**Direct peer links (WebRTC)**
    Moves, clocks, chat
    PigeonAI stage passes
    Model chunks between peers`"]
  pfs["`**PigeonFS storage servers**
    Accounts, games, tournaments
    Network model records
    Model chunks, 128 KB each`"]
  subgraph machine["`Optional server machine`"]
    server["`**PigeonAI server**
    A process per network + room
    Holds and serves models whole
    Signs each model choice`"]
    spage["`**Server page :5174**
    This server's networks
    Add, set model, stop
    Its own network only`"]
  end
  hf["`**Hugging Face**
    Safetensors and GGUF files
    Bonsai, LFM3
    Only when nobody has it`"]
  pages --> relays
  pages --> links
  pages --> pfs
  server --> links
  spage --> server
  server --> hf
```

Relays only introduce peers; moves, chat and model passes go peer to peer, and records live on PigeonFS.

## Inside a page

```mermaid
flowchart TB
  settings["`**Settings (applied on Done)**
    Network · PigeonAI: Room, Model, Hold a share, Serve whole`"]
  game["`**Game mesh**
    Network: Settings → Network (default global)
    Pigeon board: its own network, name + :pigeon
    Lobby: presence, who is here and seeking
    Matching: same clock, or Any
    Game: two players over a direct link
    Tournaments: arena pairing and standings
    History and accounts: signed, on PigeonFS`"]
  ai["`**PigeonAI mesh**
    global → network pigeonchess-ai
    any other → network chess- plus its name
    Room: Settings → PigeonAI → Room (global)
    One mesh per network + room + model
    Model split into stages; GPUs hold shares
    Asks go through the stages, nearest holder
    Model set by the server, or by a player`"]
  settings --> game
  settings --> ai
```

The two meshes never share peers: the chess network name only decides which PigeonAI network the page joins.

## Regular play

```mermaid
flowchart LR
  lobby["`**Join the lobby**
    Presence broadcast
    Who is here, who seeks`"]
  seek["`**Seek a game**
    Pick a clock, or Any
    Any takes theirs`"]
  matched["`**Matched**
    Same clock, or Any
    Both Any: first decides`"]
  play["`**Play**
    Direct link, two players
    Moves, clocks, chat`"]
  tour["`**Tournaments**
    Round robin, Swiss or arena, up to 100 players
    Pairs players into games; standings`"]
  saved["`**Saved and signed**
    Signed by your account, kept on PigeonFS
    Survives reloads; share a link to any game`"]
  lobby --> seek --> matched --> play
  lobby --> tour --> play
  play --> saved
```

Everything here runs in the game mesh of the network named in Settings; no server referees a game.

## PigeonAI: network, room and model

```mermaid
flowchart TB
  qnet{"Chess network = global?"}
  def["`**Network pigeonchess-ai**
    Model set by the PigeonAI server
    Signed; pages trust only its key`"]
  own["`**Network chess- plus its name**
    Players pick the model
    test and chess-test: both chess-test`"]
  room["`**Room**
    Settings → PigeonAI → Room; empty: global`"]
  qmod{"Model typed in Settings?"}
  follow["`**Follow the network's model**
    Start on the last one heard
    Else the network's default model
    pigeonchess-ai: Bonsai · global: LFM3`"]
  typed["`**Run the typed model**
    It becomes the network's model
    Others on the network follow it`"]
  hear["`**Hear changes**
    Record on PigeonFS, every 2 min
    Said by the server or stand-in, every 10 s
    Changed: close, start again on it`"]
  mesh["`**Join the model's mesh**
    One mesh per network + room + model`"]
  hold["`**Hold a share (on by default)**
    Stages of 2 layers, split by GPU
    Computer 2.5 GB, phone 250 MB`"]
  serve["`**Serve the whole model**
    Keep every chunk; others load it all
    Own networks and the server only`"]
  chunks["`**Where model chunks come from**
    A peer, then PigeonFS, then Hugging Face`"]
  qnet -- yes --> def
  qnet -- no --> own
  def --> room
  own --> room
  room --> qmod
  qmod -- no --> follow
  qmod -- "yes (own network)" --> typed
  follow --> hear --> mesh
  typed --> mesh
  mesh --> hold
  mesh --> serve
  hold --> chunks
  serve --> chunks
```

On global nobody but the server changes the model; on a network of your own, the last player to pick one sets it for everyone there.

## Playing the computer

```mermaid
flowchart TB
  start["`**Play → Computer**`"]
  qeng{"Standard or PigeonAI?"}
  sf["`**Stockfish in the page**
    Easy, Medium, Hard, Very Hard`"]
  ask["`**Ask PigeonAI's mesh**
    FEN, last 6 moves, the legal moves
    Only legal, non-repeating moves
    Up to 60 s, asked again once`"]
  qmv{"Legal move back?"}
  backup["`**Backup engine plays it**
    Stockfish makes the move
    Marked * in the moves, with why`"]
  pp["`**PigeonAI plays it**
    Counted in the tally`"]
  saved["`**Saved with the game**
    Who made each move, the chat and the tally survive a reload`"]
  chat["`**Chat with PigeonAI, through the same mesh**
    Talks trash in character, streams its reply, speaks up after it takes a piece`"]
  start --> qeng
  qeng -- Standard --> sf
  qeng -- PigeonAI --> ask
  ask --> qmv
  qmv -- no --> backup
  qmv -- yes --> pp
  backup --> saved
  pp --> saved
  sf --> saved
  ask --> chat
```

A PigeonAI game never stalls: when the mesh can't answer in time, Stockfish moves and the move is marked.

## A PigeonAI server

```mermaid
flowchart TB
  subgraph box["`Any always-on computer with a GPU (optional)`"]
    spage["`**Server page :5174**
    Add a network, set its model, stop one
    Devices on its local network only`"]
    sup["`**Server supervisor**
    networks.json: which networks, which model
    A process per network + room
    Restarts one that stops`"]
    p1["`**pigeonchess-ai / global**
    Runs and holds its model whole
    Signs its choice; says it every 10 s
    Stand-in in the default model's mesh`"]
    p2["`**chess-test / global (an example)**
    Runs its own model the same way
    Serves it to that network's pages
    Any other network the same`"]
    relay["`**FreeRTC relay (optional)**
    Signaling for pages and the server`"]
    pfs["`**PigeonFS (optional)**
    Records and model chunks`"]
    drive["`**Its data folder (--dir; asked on first start)**
    Models, seats, networks.json, model key (public part in model-key.pub)`"]
  end
  spage --> sup
  sup --> p1
  sup --> p2
  p1 --> drive
  p2 --> drive
  p2 --> relay
  p2 --> pfs
```

Start it with `npm run server` in a PigeonAI checkout; every network it runs comes back from networks.json. A server can set the model of networks of its own; on global and pigeonchess-ai, pages take a model only from servers whose key PigeonAI trusts.
