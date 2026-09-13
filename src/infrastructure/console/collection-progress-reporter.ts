import type { CollectionProgress } from "../../application/ports/collection-progress.js";

function pad(value: number, width: number): string {
  return String(value).padStart(width, " ");
}

export function formatProgress(progress: CollectionProgress): string {
  switch (progress.type) {
    case "PHASE_STARTED":
      return `[${progress.index}/${progress.total}] ${progress.label}`;
    case "UNIT_COLLECTED": {
      const width = String(progress.total).length;
      const counter = `${pad(progress.index, width)}/${pad(progress.total, width)}`;
      return `  [${counter}] ${progress.label} … ${progress.courses}건`;
    }
    case "PHASE_FINISHED":
      return `        └ ${progress.courses}건`;
  }
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}분 ${seconds % 60}초` : `${seconds}초`;
}
