const path = require('path')
const express = require('express')
const { createServer } = require('http')
const { Server: SocketIOServer } = require('socket.io')
const { version, validate } = require('uuid')

const ACTIONS = {
  JOIN: 'join',
  LEAVE: 'leave',
  SHARE_ROOMS: 'share-rooms',
  ADD_PEER: 'add-peer',
  REMOVE_PEER: 'remove-peer',
  RELAY_SDP: 'relay-sdp',
  RELAY_ICE: 'relay-ice',
  ICE_CANDIDATE: 'ice-candidate',
  SESSION_DESCRIPTION: 'session-description',
  TOGGLE_AUDIO: 'toggle-audio',
  TOGGLE_VIDEO: 'toggle-video',
  AUDIO_STATE_CHANGED: 'audio-state-changed',
  VIDEO_STATE_CHANGED: 'video-state-changed'
}

const app = express()
const server = createServer(app)
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

const PORT = process.env.PORT || 3001

function getClientRooms() {
  const { rooms } = io.sockets.adapter
  return Array.from(rooms.keys()).filter(
    (roomID) => validate(roomID) && version(roomID) === 4
  )
}

function getRoomInfo() {
  const socketRooms = io.sockets.adapter.rooms
  const roomsInfo = []

  for (const roomID of getClientRooms()) {
    const participantCount = socketRooms.get(roomID)?.size || 0

    roomsInfo.push({
      id: roomID,
      participants: participantCount,
      createdAt: Date.now()
    })
  }

  return roomsInfo
}

function shareRoomsInfo() {
  io.emit(ACTIONS.SHARE_ROOMS, {
    rooms: getRoomInfo()
  })
}

io.on('connection', (socket) => {
  console.log(`User ${socket.id} connected`)
  shareRoomsInfo()

  socket.on(ACTIONS.JOIN, (config) => {
    const { room: roomID } = config
    const { rooms } = socket

    if (Array.from(rooms).includes(roomID)) {
      return console.warn(`Already joined to ${roomID}`)
    }

    const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || [])

    clients.forEach((clientID) => {
      io.to(clientID).emit(ACTIONS.ADD_PEER, {
        peerID: socket.id,
        createOffer: false
      })

      socket.emit(ACTIONS.ADD_PEER, {
        peerID: clientID,
        createOffer: true
      })
    })

    socket.join(roomID)
    console.log(`User ${socket.id} joined room ${roomID}`)
    shareRoomsInfo()
  })

  // Обработка изменений состояния аудио/видео
  socket.on(ACTIONS.TOGGLE_AUDIO, ({ roomID, isAudioEnabled }) => {
    socket.to(roomID).emit(ACTIONS.AUDIO_STATE_CHANGED, {
      peerID: socket.id,
      isAudioEnabled
    })
  })

  socket.on(ACTIONS.TOGGLE_VIDEO, ({ roomID, isVideoEnabled }) => {
    socket.to(roomID).emit(ACTIONS.VIDEO_STATE_CHANGED, {
      peerID: socket.id,
      isVideoEnabled
    })
  })

  function leaveRoom() {
    const { rooms } = socket

    Array.from(rooms)
      .filter((roomID) => validate(roomID) && version(roomID) === 4)
      .forEach((roomID) => {
        const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || [])

        clients.forEach((clientID) => {
          io.to(clientID).emit(ACTIONS.REMOVE_PEER, {
            peerID: socket.id
          })

          socket.emit(ACTIONS.REMOVE_PEER, {
            peerID: clientID
          })
        })

        socket.leave(roomID)
        console.log(`User ${socket.id} left room ${roomID}`)
      })

    shareRoomsInfo()
  }

  socket.on(ACTIONS.LEAVE, leaveRoom)
  socket.on('disconnecting', leaveRoom)

  socket.on(ACTIONS.RELAY_SDP, ({ peerID, sessionDescription }) => {
    io.to(peerID).emit(ACTIONS.SESSION_DESCRIPTION, {
      peerID: socket.id,
      sessionDescription
    })
  })

  socket.on(ACTIONS.RELAY_ICE, ({ peerID, iceCandidate }) => {
    io.to(peerID).emit(ACTIONS.ICE_CANDIDATE, {
      peerID: socket.id,
      iceCandidate
    })
  })

  socket.on('disconnect', () => {
    console.log(`User ${socket.id} disconnected`)
  })
})

const publicPath = path.join(__dirname, 'build')

app.use(express.static(publicPath))

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'))
})

server.listen(PORT, () => {
  console.log(`Server Started on port ${PORT}!`)
})
