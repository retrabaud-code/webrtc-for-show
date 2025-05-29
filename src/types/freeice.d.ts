declare module 'freeice' {
  interface IceServer {
    urls: string | string[]
    username?: string
    credential?: string
  }

  function freeice(): IceServer[]
  export = freeice
}
