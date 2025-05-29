import React, { useState, useEffect, useRef } from 'react'
import socket from '../../socket'
import ACTIONS from '../../socket/actions'
import { useHistory } from 'react-router-dom'
import { v4 } from 'uuid'

interface Room {
  id: string
  participants: number
}

type RoomData = string | Room

interface ShareRoomsPayload {
  rooms?: RoomData[]
}

const Main: React.FC = () => {
  // const history = useHistory()
  const [rooms, updateRooms] = useState<RoomData[]>([])
  const rootNode = useRef<HTMLDivElement>(null)

  useEffect(() => {
    socket.on(ACTIONS.SHARE_ROOMS, ({ rooms = [] }: ShareRoomsPayload = {}) => {
      if (rootNode.current) {
        updateRooms(rooms)
      }
    })

    return () => {
      socket.off(ACTIONS.SHARE_ROOMS)
    }
  }, [])

  // const joinRoom = (roomID: string) => {
  //   history.push(`/room/${roomID}`)
  // }

  // const createRoom = () => {
  //   history.push(`/room/${v4()}`)
  // }

  return (
    <div
      ref={rootNode}
      style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}
    >
      простите, мне пришлось спрятать часть кода и верстку
    </div>
  )
}

export default Main
