import { useEffect, useRef, useCallback, useState } from 'react'
import freeice from 'freeice'
import useStateWithCallback from './useStateWithCallback'
import socket from '../socket'
import ACTIONS from '../socket/actions'

export const LOCAL_VIDEO = 'LOCAL_VIDEO'

interface NewPeerPayload {
  peerID: string
  createOffer: boolean
}

interface RelaySDPPayload {
  peerID: string
  sessionDescription: RTCSessionDescriptionInit
}

interface IceCandidatePayload {
  peerID: string
  iceCandidate: RTCIceCandidateInit
}

interface RemovePeerPayload {
  peerID: string
}

interface PeerMediaElements {
  [key: string]: HTMLVideoElement | null
}

interface PeerConnections {
  [key: string]: RTCPeerConnection
}

interface UseWebRTCReturn {
  clients: string[]
  provideMediaRef: (id: string, node: HTMLVideoElement | null) => void
  toggleVideo: () => void
  toggleAudio: () => void
  toggleScreenShare: () => void
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isScreenSharing: boolean
  peerAudioStates: { [key: string]: boolean }
  peerVideoStates: { [key: string]: boolean }
}

// error types MediaDevices
interface MediaDeviceError extends Error {
  name:
    | 'NotAllowedError'
    | 'NotFoundError'
    | 'NotReadableError'
    | 'OverconstrainedError'
    | 'TypeError'
    | 'AbortError'
    | string
  message: string
}

// check MediaDeviceError
function isMediaDeviceError(error: unknown): error is MediaDeviceError {
  return error instanceof Error && 'name' in error
}

export default function useWebRTC(roomID: string): UseWebRTCReturn {
  const [clients, updateClients] = useStateWithCallback<string[]>([])
  const [isVideoEnabled, setIsVideoEnabled] = useState<boolean>(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true)
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false)
  const [peerAudioStates, setPeerAudioStates] = useState<{
    [key: string]: boolean
  }>({})
  const [peerVideoStates, setPeerVideoStates] = useState<{
    [key: string]: boolean
  }>({})

  const addNewClient = useCallback(
    (newClient: string, cb?: () => void) => {
      updateClients((list) => {
        if (!list.includes(newClient)) {
          if (newClient !== LOCAL_VIDEO) {
            setPeerAudioStates((prev) => ({ ...prev, [newClient]: true }))
            setPeerVideoStates((prev) => ({ ...prev, [newClient]: true }))
          }
          return [...list, newClient]
        }
        return list
      }, cb)
    },
    [updateClients]
  )

  const peerConnections = useRef<PeerConnections>({})
  const localMediaStream = useRef<MediaStream | null>(null)
  const peerMediaElements = useRef<PeerMediaElements>({
    [LOCAL_VIDEO]: null
  })

  useEffect(() => {
    async function handleNewPeer({ peerID, createOffer }: NewPeerPayload) {
      if (peerID in peerConnections.current) {
        return console.warn(`Already connected to peer ${peerID}`)
      }

      peerConnections.current[peerID] = new RTCPeerConnection({
        iceServers: freeice()
      })

      peerConnections.current[peerID].onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit(ACTIONS.RELAY_ICE, {
            peerID,
            iceCandidate: event.candidate
          })
        }
      }

      let tracksNumber = 0
      peerConnections.current[peerID].ontrack = ({
        streams: [remoteStream]
      }) => {
        tracksNumber++

        const audioTracks = remoteStream.getAudioTracks()
        const videoTracks = remoteStream.getVideoTracks()

        audioTracks.forEach((track) => {
          track.addEventListener('ended', () => {
            setPeerAudioStates((prev) => ({ ...prev, [peerID]: false }))
          })
        })

        videoTracks.forEach((track) => {
          track.addEventListener('ended', () => {
            setPeerVideoStates((prev) => ({ ...prev, [peerID]: false }))
          })

          // Отслеживаем изменения включенности трека
          track.addEventListener('mute', () => {
            setPeerVideoStates((prev) => ({ ...prev, [peerID]: false }))
          })

          track.addEventListener('unmute', () => {
            setPeerVideoStates((prev) => ({ ...prev, [peerID]: true }))
          })
        })

        const shouldAddClient = tracksNumber === 1 || tracksNumber === 2

        if (shouldAddClient) {
          if (
            tracksNumber === 2 ||
            (tracksNumber === 1 && audioTracks.length + videoTracks.length >= 1)
          ) {
            tracksNumber = 0

            const hasVideo = videoTracks.length > 0 && videoTracks[0].enabled
            setPeerVideoStates((prev) => ({ ...prev, [peerID]: hasVideo }))

            const hasAudio = audioTracks.length > 0 && audioTracks[0].enabled
            setPeerAudioStates((prev) => ({ ...prev, [peerID]: hasAudio }))

            addNewClient(peerID, () => {
              if (peerMediaElements.current[peerID]) {
                peerMediaElements.current[peerID]!.srcObject = remoteStream
              } else {
                let settled = false
                const interval = setInterval(() => {
                  if (peerMediaElements.current[peerID]) {
                    peerMediaElements.current[peerID]!.srcObject = remoteStream
                    settled = true
                  }

                  if (settled) {
                    clearInterval(interval)
                  }
                }, 1000)
              }
            })
          }
        }

        if (tracksNumber === 1) {
          setTimeout(() => {
            const currentAudioTracks = remoteStream.getAudioTracks()
            const currentVideoTracks = remoteStream.getVideoTracks()

            if (currentAudioTracks.length + currentVideoTracks.length === 1) {
              // if only audio | video
              tracksNumber = 0

              const hasVideo =
                currentVideoTracks.length > 0 && currentVideoTracks[0].enabled
              setPeerVideoStates((prev) => ({ ...prev, [peerID]: hasVideo }))

              const hasAudio =
                currentAudioTracks.length > 0 && currentAudioTracks[0].enabled
              setPeerAudioStates((prev) => ({ ...prev, [peerID]: hasAudio }))

              if (!peerMediaElements.current[peerID]) {
                addNewClient(peerID, () => {
                  if (peerMediaElements.current[peerID]) {
                    peerMediaElements.current[peerID]!.srcObject = remoteStream
                  } else {
                    let settled = false
                    const interval = setInterval(() => {
                      if (peerMediaElements.current[peerID]) {
                        peerMediaElements.current[peerID]!.srcObject =
                          remoteStream
                        settled = true
                      }

                      if (settled) {
                        clearInterval(interval)
                      }
                    }, 1000)
                  }
                })
              }
            }
          }, 500) // await for second track
        }
      }

      if (localMediaStream.current) {
        localMediaStream.current.getTracks().forEach((track) => {
          peerConnections.current[peerID].addTrack(
            track,
            localMediaStream.current!
          )
        })
      }

      if (createOffer) {
        const offer = await peerConnections.current[peerID].createOffer()
        await peerConnections.current[peerID].setLocalDescription(offer)

        socket.emit(ACTIONS.RELAY_SDP, {
          peerID,
          sessionDescription: offer
        })
      }
    }

    socket.on(ACTIONS.ADD_PEER, handleNewPeer)

    return () => {
      socket.off(ACTIONS.ADD_PEER)
    }
  }, [addNewClient])

  useEffect(() => {
    async function setRemoteMedia({
      peerID,
      sessionDescription: remoteDescription
    }: RelaySDPPayload) {
      await peerConnections.current[peerID]?.setRemoteDescription(
        new RTCSessionDescription(remoteDescription)
      )

      if (remoteDescription.type === 'offer') {
        const answer = await peerConnections.current[peerID].createAnswer()
        await peerConnections.current[peerID].setLocalDescription(answer)

        socket.emit(ACTIONS.RELAY_SDP, {
          peerID,
          sessionDescription: answer
        })
      }
    }

    socket.on(ACTIONS.SESSION_DESCRIPTION, setRemoteMedia)

    return () => {
      socket.off(ACTIONS.SESSION_DESCRIPTION)
    }
  }, [])

  useEffect(() => {
    socket.on(
      ACTIONS.ICE_CANDIDATE,
      ({ peerID, iceCandidate }: IceCandidatePayload) => {
        peerConnections.current[peerID]?.addIceCandidate(
          new RTCIceCandidate(iceCandidate)
        )
      }
    )

    return () => {
      socket.off(ACTIONS.ICE_CANDIDATE)
    }
  }, [])

  useEffect(() => {
    const handleRemovePeer = ({ peerID }: RemovePeerPayload) => {
      if (peerConnections.current[peerID]) {
        peerConnections.current[peerID].close()
      }

      delete peerConnections.current[peerID]
      delete peerMediaElements.current[peerID]

      updateClients((list) => list.filter((c) => c !== peerID))

      setPeerAudioStates((prev) => {
        const newStates = { ...prev }
        delete newStates[peerID]
        return newStates
      })
      setPeerVideoStates((prev) => {
        const newStates = { ...prev }
        delete newStates[peerID]
        return newStates
      })
    }

    socket.on(ACTIONS.REMOVE_PEER, handleRemovePeer)

    return () => {
      socket.off(ACTIONS.REMOVE_PEER)
    }
  }, [updateClients])

  useEffect(() => {
    socket.on(
      ACTIONS.AUDIO_STATE_CHANGED,
      ({
        peerID,
        isAudioEnabled
      }: {
        peerID: string
        isAudioEnabled: boolean
      }) => {
        setPeerAudioStates((prev) => ({
          ...prev,
          [peerID]: isAudioEnabled
        }))
      }
    )

    return () => {
      socket.off(ACTIONS.AUDIO_STATE_CHANGED)
    }
  }, [])

  useEffect(() => {
    socket.on(
      ACTIONS.VIDEO_STATE_CHANGED,
      ({
        peerID,
        isVideoEnabled
      }: {
        peerID: string
        isVideoEnabled: boolean
      }) => {
        setPeerVideoStates((prev) => ({
          ...prev,
          [peerID]: isVideoEnabled
        }))
      }
    )

    return () => {
      socket.off(ACTIONS.VIDEO_STATE_CHANGED)
    }
  }, [])

  useEffect(() => {
    async function startCapture() {
      const constraintsList: MediaStreamConstraints[] = [
        // Попытка 1: Полные constraints
        {
          audio: true,
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 }
          }
        },
        // Попытка 2: Упрощенные constraints
        {
          audio: true,
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 }
          }
        },
        // Попытка 3: Минимальные constraints
        {
          audio: true,
          video: {
            width: 320,
            height: 240
          }
        },
        // Попытка 4: Только базовое видео
        {
          audio: true,
          video: true
        },
        // Попытка 5: Только аудио (крайний случай)
        {
          audio: true,
          video: false
        }
      ]

      // Дополнительная проверка поддержки API
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia не поддерживается в этом браузере')
      }

      let lastError: unknown = null

      for (let i = 0; i < constraintsList.length; i++) {
        try {
          console.log(`Попытка ${i + 1} с constraints:`, constraintsList[i])

          localMediaStream.current = await navigator.mediaDevices.getUserMedia(
            constraintsList[i]
          )

          console.log('Успешно получен медиа-поток:', {
            videoTracks: localMediaStream.current.getVideoTracks().length,
            audioTracks: localMediaStream.current.getAudioTracks().length
          })

          addNewClient(LOCAL_VIDEO, () => {
            const localVideoElement = peerMediaElements.current[LOCAL_VIDEO]

            if (localVideoElement) {
              localVideoElement.volume = 0
              localVideoElement.srcObject = localMediaStream.current
            }
          })

          socket.emit(ACTIONS.JOIN, { room: roomID })
        } catch (error) {
          console.error(`Попытка ${i + 1} не удалась:`, error)
          lastError = error

          if (i < constraintsList.length - 1) {
            continue
          }
        }
      }

      // for debag
      console.error(
        'Все попытки получения медиа не удались. Последняя ошибка:',
        lastError
      )

      if (isMediaDeviceError(lastError)) {
        switch (lastError.name) {
          case 'NotAllowedError':
            alert(
              'Доступ к камере/микрофону заблокирован. Разрешите доступ в настройках браузера.'
            )
            break
          case 'NotFoundError':
            alert(
              'Камера или микрофон не найдены. Проверьте подключение устройств.'
            )
            break
          case 'NotReadableError':
            alert(
              'Камера или микрофон уже используются другим приложением. Закройте другие приложения, использующие камеру.'
            )
            break
          case 'OverconstrainedError':
            alert(
              'Ваша камера не поддерживает запрошенные настройки. Попробуйте использовать другой браузер.'
            )
            break
          default:
            if (lastError.message.includes('Starting videoinput failed')) {
              alert(
                'Ошибка запуска камеры в Firefox. Попробуйте:\n1. Перезапустить браузер\n2. Проверить права доступа к камере\n3. Закрыть другие приложения, использующие камеру\n4. Использовать Chrome как альтернативу'
              )
            } else {
              alert(`Ошибка доступа к медиа: ${lastError.message}`)
            }
        }
      } else {
        alert(
          'Произошла неизвестная ошибка при доступе к камере/микрофону. Попробуйте перезапустить браузер.'
        )
      }
    }

    startCapture()

    return () => {
      if (localMediaStream.current) {
        localMediaStream.current.getTracks().forEach((track) => track.stop())
      }
      socket.emit(ACTIONS.LEAVE)
    }
  }, [roomID, addNewClient])

  const toggleVideo = useCallback(async () => {
    if (!localMediaStream.current) return

    const videoTracks = localMediaStream.current.getVideoTracks()

    if (videoTracks.length > 0) {
      const newVideoState = !isVideoEnabled
      videoTracks.forEach((track) => {
        track.enabled = newVideoState
      })
      setIsVideoEnabled(newVideoState)

      // alarm other user about action
      socket.emit(ACTIONS.TOGGLE_VIDEO, {
        roomID,
        isVideoEnabled: newVideoState
      })
    }
  }, [isVideoEnabled, roomID])

  const toggleAudio = useCallback(() => {
    if (!localMediaStream.current) return

    const audioTracks = localMediaStream.current.getAudioTracks()

    if (audioTracks.length > 0) {
      const newAudioState = !isAudioEnabled
      audioTracks.forEach((track) => {
        track.enabled = newAudioState
      })
      setIsAudioEnabled(newAudioState)

      socket.emit(ACTIONS.TOGGLE_AUDIO, {
        roomID,
        isAudioEnabled: newAudioState
      })
    }
  }, [isAudioEnabled, roomID])

  const toggleScreenShare = useCallback(async () => {
    try {
      let newStream: MediaStream

      if (!isScreenSharing) {
        // getDisplayMedia for Firefox
        if (!navigator.mediaDevices.getDisplayMedia) {
          throw new Error(
            'Демонстрация экрана не поддерживается в этом браузере'
          )
        }

        newStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        })

        const videoTrack = newStream.getVideoTracks()[0]
        if (videoTrack) {
          videoTrack.addEventListener('ended', async () => {
            console.log('Screen sharing ended by user')
            if (isScreenSharing) {
              try {
                const cameraStream = await navigator.mediaDevices.getUserMedia({
                  audio: true,
                  video: true
                })

                const localVideoElement = peerMediaElements.current[LOCAL_VIDEO]
                if (localVideoElement) {
                  localVideoElement.srcObject = cameraStream
                }

                for (const peerID in peerConnections.current) {
                  const peerConnection = peerConnections.current[peerID]
                  const senders = peerConnection.getSenders()

                  for (const sender of senders) {
                    if (sender.track?.kind === 'video') {
                      await sender.replaceTrack(
                        cameraStream.getVideoTracks()[0]
                      )
                    } else if (sender.track?.kind === 'audio') {
                      await sender.replaceTrack(
                        cameraStream.getAudioTracks()[0]
                      )
                    }
                  }

                  // Renegotiation
                  const offer = await peerConnection.createOffer()
                  await peerConnection.setLocalDescription(offer)
                  socket.emit(ACTIONS.RELAY_SDP, {
                    peerID,
                    sessionDescription: offer
                  })
                }

                if (localMediaStream.current) {
                  localMediaStream.current
                    .getTracks()
                    .forEach((track) => track.stop())
                }

                localMediaStream.current = cameraStream
                setIsScreenSharing(false)
              } catch (error) {
                console.error('Failed to switch back to camera:', error)
                setIsScreenSharing(false)
              }
            }
          })
        }

        setIsScreenSharing(true)
      } else {
        const simpleConstraints: MediaStreamConstraints = {
          audio: true,
          video: true
        }

        try {
          newStream =
            await navigator.mediaDevices.getUserMedia(simpleConstraints)
        } catch (error) {
          newStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { width: 320, height: 240 }
          })
        }

        setIsScreenSharing(false)
      }

      const localVideoElement = peerMediaElements.current[LOCAL_VIDEO]
      if (localVideoElement) {
        localVideoElement.srcObject = newStream
      }

      const replacePromises: Promise<void>[] = []

      for (const peerID in peerConnections.current) {
        const peerConnection = peerConnections.current[peerID]

        // const oldVideoTrack = localMediaStream.current?.getVideoTracks()[0]
        // const oldAudioTrack = localMediaStream.current?.getAudioTracks()[0]
        const newVideoTrack = newStream.getVideoTracks()[0]
        const newAudioTrack = newStream.getAudioTracks()[0]

        const senders = peerConnection.getSenders()

        for (const sender of senders) {
          if (sender.track) {
            if (sender.track.kind === 'video' && newVideoTrack) {
              replacePromises.push(sender.replaceTrack(newVideoTrack))
            } else if (sender.track.kind === 'audio' && newAudioTrack) {
              replacePromises.push(sender.replaceTrack(newAudioTrack))
            }
          }
        }

        const videoSender = senders.find((s) => s.track?.kind === 'video')
        const audioSender = senders.find((s) => s.track?.kind === 'audio')

        if (!videoSender && newVideoTrack) {
          peerConnection.addTrack(newVideoTrack, newStream)
        }
        if (!audioSender && newAudioTrack) {
          peerConnection.addTrack(newAudioTrack, newStream)
        }
      }

      await Promise.all(replacePromises)

      if (localMediaStream.current) {
        localMediaStream.current.getTracks().forEach((track) => track.stop())
      }

      localMediaStream.current = newStream

      for (const peerID in peerConnections.current) {
        const peerConnection = peerConnections.current[peerID]

        try {
          const offer = await peerConnection.createOffer()
          await peerConnection.setLocalDescription(offer)

          socket.emit(ACTIONS.RELAY_SDP, {
            peerID,
            sessionDescription: offer
          })

          console.log(`Renegotiation initiated for peer ${peerID}`)
        } catch (error) {
          console.error(`Failed to renegotiate with peer ${peerID}:`, error)
        }
      }
    } catch (error) {
      console.error('Error toggling screen share:', error)

      if (isMediaDeviceError(error)) {
        alert(`Не удалось переключить демонстрацию экрана: ${error.message}`)
      } else {
        alert('Не удалось переключить демонстрацию экрана')
      }
    }
  }, [isScreenSharing])

  const provideMediaRef = useCallback(
    (id: string, node: HTMLVideoElement | null) => {
      peerMediaElements.current[id] = node
    },
    []
  )

  return {
    clients,
    provideMediaRef,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    isVideoEnabled,
    isAudioEnabled,
    isScreenSharing,
    peerAudioStates,
    peerVideoStates
  }
}
