import { customRef, markRaw, shallowRef, type Ref } from 'vue'

/**
 * A ref for a chess board (chess.js, or the pigeon board) that Vue does not look inside.
 *
 * In a deep ref the board was a reactive proxy, and asking it a question such as
 * isCheckmate(), isDraw() or isGameOver() makes and undoes moves on its own state to find
 * out, which Vue took for changes. A question asked while the page was drawing (the result
 * line at the end of a game asks all of them) then changed what the drawing read, so it drew
 * again, and asked again: "Maximum recursive updates" here, and in a production build, where
 * Vue does not stop it, a page frozen for good.
 *
 * Here the board is kept as it is (markRaw). The page still follows the game: the board's own
 * changes (move, undo, load, reset and the like) bump a version every board ref reads, so
 * what shows a board is drawn again after each real change, and never by a question.
 */
const version = shallowRef(0)
const MUTATORS = ['move', 'undo', 'load', 'reset', 'clear', 'put', 'remove', 'loadPgn', 'setTurn', 'setCastlingRights'] as const
const TRACKED = Symbol('board-tracked')

function untracked<T>(board: T): T {
  if (!board || typeof board !== 'object' || (board as any)[TRACKED]) return board
  const raw = markRaw(board as any)
  for (const name of MUTATORS) {
    const change = raw[name]
    if (typeof change !== 'function') continue
    Object.defineProperty(raw, name, {
      configurable: true,
      writable: true,
      value: (...args: unknown[]) => {
        try {
          return change.apply(raw, args)
        } finally {
          version.value++
        }
      },
    })
  }
  Object.defineProperty(raw, TRACKED, { value: true })
  return raw
}

/** Read inside a render, computed or watcher: it runs again after any board's own change. */
export function boardChanged(): number {
  return version.value
}

export function boardRef<T>(initial: T): Ref<T> {
  return customRef<T>((track, trigger) => {
    let board = untracked(initial)
    return {
      get() {
        track()
        void version.value // drawn again after the board's own changes
        return board
      },
      set(next) {
        board = untracked(next)
        trigger()
      },
    }
  })
}
