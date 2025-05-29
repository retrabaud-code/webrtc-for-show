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
} as const

export type ActionType = (typeof ACTIONS)[keyof typeof ACTIONS]

export default ACTIONS
