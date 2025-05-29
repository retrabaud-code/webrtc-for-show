import io from 'socket.io-client'

interface SocketOptions {
  'force new connection': boolean
  reconnectionAttempts: number
  timeout: number
  transports: string[]
}

const options: SocketOptions = {
  'force new connection': true,
  reconnectionAttempts: Infinity,
  timeout: 10000,
  transports: ['websocket']
}

const socket = io(process.env.REACT_APP_SOCKET_CONNECTION, options)

export default socket
