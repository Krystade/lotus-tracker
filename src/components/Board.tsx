import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import { PlayerTile } from "./PlayerTile";

interface Props {
  onOpenDetail: (playerId: string) => void;
}

/** Lays out the player tiles on a CSS grid defined by the active layout. */
export function Board({ onOpenDetail }: Props) {
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
        />
      ))}
    </div>
  );
}
