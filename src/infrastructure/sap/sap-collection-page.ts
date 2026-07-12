export interface SapFilterOption {
  key: string;
  label: string;
}

export interface SapCollectionPage {
  reset(): Promise<void>;
  selectTab(index: number): Promise<void>;
  listFilterOptions(filterIndex: number): Promise<SapFilterOption[]>;
  selectFilterOption(filterIndex: number, key: string): Promise<void>;
  search(timeoutMs?: number): Promise<boolean>;
  readRows(): Promise<string[][]>;
}
