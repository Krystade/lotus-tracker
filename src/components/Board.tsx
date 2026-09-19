import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import { PlayerTile } from "./PlayerTile";

interface Props {
  onOpenDetail: (playerId: string) => void;
  /** Seat currently playing a pass-the-time game, if any. */
  arcadeSeat: string | null;
  onCloseArcade: () => void;
}

/** Lays out the player tiles on a CSS grid defined by the active layout. */
export function Board({ onOpenDetail, arcadeSeat, onCloseArcade }: Props) {
  const layout = useStore((s) => s.game.layout);

  const style: CSSProperties = {
    gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
    gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
  };

  return (
    <div className="board" style={style}>
      {layout.placements.map((placement) => (
        <PlayerTile
          key={placement.playerId}
          placement={placement}
          onOpenDetail={onOpenDetail}
          arcadeOpen={arcadeSeat === placement.playerId}
          onCloseArcade={onCloseArcade}
        />
      ))}
    </div>
  );
}
