export interface LogSegment {
  text: string;
  /** Present when this segment names a player; used to colorize it by their token color. */
  playerId?: string;
}

export type LogLine = LogSegment[];
