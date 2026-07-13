// 수집은 40분 넘게 걸리는데 그동안 밖에서는 살아 있는지조차 알 수 없다.
// 어디까지 왔는지, 어디에서 멈췄는지 알 수 있도록 단계마다 보고한다.
export type CollectionProgress =
  | { type: "PHASE_STARTED"; label: string; index: number; total: number }
  | { type: "UNIT_COLLECTED"; label: string; index: number; total: number; courses: number }
  | { type: "PHASE_FINISHED"; label: string; courses: number };

export type CollectionProgressListener = (progress: CollectionProgress) => void;
